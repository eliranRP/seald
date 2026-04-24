import {
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Envelope, EnvelopeField, EnvelopeSigner } from '../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';

export interface StartSessionResult {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
  /** The session JWT to set as an HttpOnly cookie on the response. */
  readonly session_jwt: string;
}

export interface SignMeResponse {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly short_code: string;
    readonly status: Envelope['status'];
    readonly original_pages: number | null;
    readonly expires_at: string;
    readonly tc_version: string;
    readonly privacy_version: string;
  };
  readonly signer: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly color: string;
    readonly role: EnvelopeSigner['role'];
    readonly status: EnvelopeSigner['status'];
    readonly viewed_at: string | null;
    readonly tc_accepted_at: string | null;
    readonly signed_at: string | null;
    readonly declined_at: string | null;
  };
  /** Fields the caller should fill. Only fields belonging to THIS signer. */
  readonly fields: ReadonlyArray<EnvelopeField>;
  /** Other signers — status only, emails + names masked. */
  readonly other_signers: ReadonlyArray<{
    readonly id: string;
    readonly status: EnvelopeSigner['status'];
    readonly name_masked: string;
  }>;
}

/**
 * Recipient-side orchestration for `/sign/*` routes. Counterpart to
 * EnvelopesService (sender-side), but operates on narrowly-scoped signer
 * sessions rather than full owner context. Every method that mutates
 * assumes the caller has validated the session via SignerSessionGuard.
 */
@Injectable()
export class SigningService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly tokens: SigningTokenService,
    private readonly session: SignerSessionService,
    private readonly storage: StorageService,
  ) {}

  async startSession(envelope_id: string, token: string): Promise<StartSessionResult> {
    // Hash at the boundary; plaintext never persists.
    const hash = this.tokens.hash(token);
    const found = await this.repo.findSignerByAccessTokenHash(hash);
    if (!found) {
      throw new UnauthorizedException('invalid_token');
    }
    const { envelope, signer } = found;

    // Guard against token-guess across envelopes: the token must belong to
    // the envelope in the request body.
    if (envelope.id !== envelope_id) {
      throw new UnauthorizedException('invalid_token');
    }

    assertStillSignable(envelope, signer);

    const session_jwt = await this.session.mint({
      envelope_id: envelope.id,
      signer_id: signer.id,
    });

    return {
      envelope_id: envelope.id,
      signer_id: signer.id,
      // Always true at start for MVP. /sign/accept-terms is idempotent, so a
      // re-click is a no-op; /sign/me returns the authoritative tc state so
      // the FE can skip the gate if already accepted.
      requires_tc_accept: true,
      session_jwt,
    };
  }

  /**
   * Session-scoped read: the signer's own view of the envelope. Filters
   * fields to only those assigned to this signer; masks other signers' names
   * so one signer doesn't inadvertently learn another's identity from an
   * invite mistake.
   */
  me(envelope: Envelope, signer: EnvelopeSigner): SignMeResponse {
    const myFields = envelope.fields.filter((f) => f.signer_id === signer.id);
    const others = envelope.signers
      .filter((s) => s.id !== signer.id)
      .map((s) => ({
        id: s.id,
        status: s.status,
        name_masked: maskName(s.name),
      }));
    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        short_code: envelope.short_code,
        status: envelope.status,
        original_pages: envelope.original_pages,
        expires_at: envelope.expires_at,
        tc_version: envelope.tc_version,
        privacy_version: envelope.privacy_version,
      },
      signer: {
        id: signer.id,
        email: signer.email,
        name: signer.name,
        color: signer.color,
        role: signer.role,
        status: signer.status,
        viewed_at: signer.viewed_at,
        tc_accepted_at: signer.tc_accepted_at,
        signed_at: signer.signed_at,
        declined_at: signer.declined_at,
      },
      fields: myFields,
      other_signers: others,
    };
  }

  /** Mints a short-lived (90s) signed URL for the envelope's original PDF. */
  getOriginalPdfSignedUrl(envelope: Envelope): Promise<string> {
    // Envelope domain type doesn't expose original_file_path. Use the
    // deterministic path set by EnvelopesService.uploadOriginal.
    const path = `${envelope.id}/original.pdf`;
    return this.storage.createSignedUrl(path, 90);
  }

  /**
   * Stamp tc_accepted_at (idempotent), viewed_at (idempotent), and emit
   * tc_accepted + viewed events if this is the signer's first time. Every
   * stamp runs before event append so the append only fires on the real
   * transition — signers clicking twice don't pollute the audit with dupes.
   */
  async acceptTerms(
    envelope: Envelope,
    signer: EnvelopeSigner,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.repo.acceptTerms(signer.id);
    await this.repo.recordSignerViewed(signer.id, ip, userAgent);

    if (signer.tc_accepted_at === null) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'signer',
        event_type: 'tc_accepted',
        ip,
        user_agent: userAgent,
        metadata: {
          tc_version: envelope.tc_version,
          privacy_version: envelope.privacy_version,
        },
      });
    }
    if (signer.viewed_at === null) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'signer',
        event_type: 'viewed',
        ip,
        user_agent: userAgent,
        metadata: {},
      });
    }
  }
}

function assertStillSignable(envelope: Envelope, signer: EnvelopeSigner): void {
  if (envelope.status !== 'awaiting_others') {
    throw new GoneException('envelope_terminal');
  }
  if (signer.signed_at !== null) {
    throw new ConflictException('already_signed');
  }
  if (signer.declined_at !== null) {
    throw new ConflictException('already_declined');
  }
}

/** "Ada Lovelace" → "A***e L***e" so co-signer names don't fully leak. */
function maskName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return part;
      if (part.length === 2) return `${part[0]}*`;
      return `${part[0]}***${part[part.length - 1]}`;
    })
    .join(' ');
}
