import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  PreconditionFailedException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { SignatureFormat } from 'shared';
import type {
  Envelope,
  EnvelopeField,
  EnvelopeSigner,
  SetSignerSignatureInput,
} from '../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';

const MAX_SIGNATURE_BYTES = 512 * 1024; // 512 KB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const SIGNATURE_TARGET_WIDTH = 600;
const SIGNATURE_TARGET_HEIGHT = 200;

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

  /**
   * Fill a non-signature field (date / text / checkbox / email). Enforces:
   *   - field exists in envelope + belongs to THIS signer (else 404)
   *   - field is not a signature/initials kind (those use /sign/signature)
   *   - payload shape matches field kind (text vs boolean)
   */
  async fillField(
    envelope: Envelope,
    signer: EnvelopeSigner,
    field_id: string,
    body: { value_text?: string; value_boolean?: boolean },
    ip: string | null,
    userAgent: string | null,
  ): Promise<EnvelopeField> {
    const field = envelope.fields.find((f) => f.id === field_id);
    if (!field) throw new NotFoundException('field_not_found');
    if (field.signer_id !== signer.id) throw new NotFoundException('field_not_found');
    if (field.kind === 'signature' || field.kind === 'initials') {
      throw new BadRequestException('wrong_field_kind');
    }

    // Kind → expected payload shape. Service is authoritative; DTO is a
    // defense-in-depth first pass.
    if (field.kind === 'checkbox') {
      if (typeof body.value_boolean !== 'boolean') {
        throw new BadRequestException('wrong_field_kind');
      }
    } else if (typeof body.value_text !== 'string') {
      throw new BadRequestException('wrong_field_kind');
    }

    const updated = await this.repo.fillField(field_id, signer.id, {
      value_text: body.value_text ?? null,
      value_boolean: body.value_boolean ?? null,
    });
    if (!updated) throw new NotFoundException('field_not_found');

    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'field_filled',
      ip,
      user_agent: userAgent,
      metadata: { field_id, kind: field.kind },
    });

    return updated;
  }

  /**
   * Finalize the signer's participation:
   *   1. Enforce pre-conditions — TC accepted, all required fields filled,
   *      signature uploaded. These also exist as repo-level invariants but
   *      we check here first to return precise 4xx slugs.
   *   2. Atomic submit via repo.submitSigner (row-conditional UPDATE).
   *   3. Append `signed` event.
   *   4. If this was the last signer: append `all_signed` event and enqueue
   *      a `seal` job (the worker picks it up in Phase 3e).
   *
   * Returns `{ status: 'submitted', envelope_status }`. Controller clears the
   * session cookie on success — further /sign/* calls from this signer will
   * 401 until a new /sign/start (impossible since their token can only
   * activate when signer is !signed/declined, which is no longer true).
   */
  async submit(
    envelope: Envelope,
    signer: EnvelopeSigner,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ status: 'submitted'; envelope_status: Envelope['status'] }> {
    if (signer.tc_accepted_at === null) {
      throw new PreconditionFailedException('tc_required');
    }
    // Required fields for THIS signer must all be filled.
    const myFields = envelope.fields.filter((f) => f.signer_id === signer.id);
    const hasSignatureField = myFields.some((f) => f.kind === 'signature' || f.kind === 'initials');
    if (!hasSignatureField) {
      // Data-integrity guard — envelopes.service.send already enforces this
      // at send time, but if something slipped through, 412 is the right
      // precondition failure.
      throw new PreconditionFailedException('signature_required');
    }
    const unfilledRequired = myFields.filter(
      (f) => f.required && f.kind !== 'signature' && f.kind !== 'initials' && f.filled_at === null,
    );
    if (unfilledRequired.length > 0) {
      throw new UnprocessableEntityException('missing_fields');
    }

    const submitted = await this.repo.submitSigner(signer.id, ip, userAgent);
    if (!submitted) {
      // Race or missing signature — re-read to tell the user why.
      const fresh = await this.repo.findByIdWithAll(envelope.id);
      const freshSigner = fresh?.signers.find((s) => s.id === signer.id);
      if (!fresh || fresh.status !== 'awaiting_others') {
        throw new GoneException('envelope_terminal');
      }
      if (freshSigner?.signed_at) throw new ConflictException('already_signed');
      if (freshSigner?.declined_at) throw new ConflictException('already_declined');
      // No signature image yet.
      throw new PreconditionFailedException('signature_required');
    }

    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'signed',
      ip,
      user_agent: userAgent,
      metadata: {},
    });

    if (submitted.all_signed) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        actor_kind: 'system',
        event_type: 'all_signed',
        metadata: {},
      });
      await this.repo.enqueueJob(envelope.id, 'seal');
    }

    return { status: 'submitted', envelope_status: submitted.envelope_status };
  }

  /**
   * Accept a signature image (PNG or JPEG), normalize via sharp to a
   * canonical 600×200 PNG, upload to `{envelope_id}/signatures/{signer_id}.png`,
   * and stamp signer.signature_format + signature_image_path.
   *
   * All three capture modes (drawn/typed/upload) converge on the same
   * canonical artifact — the worker's burn-in pass (Phase 3e) then draws
   * this single PNG at every signature field assigned to this signer.
   */
  async setSignature(
    envelope: Envelope,
    signer: EnvelopeSigner,
    image: Buffer,
    meta: {
      format: SignatureFormat;
      font?: string | null;
      stroke_count?: number | null;
      source_filename?: string | null;
    },
  ): Promise<EnvelopeSigner> {
    if (image.length === 0) {
      throw new BadRequestException('image_unreadable');
    }
    if (image.length > MAX_SIGNATURE_BYTES) {
      throw new PayloadTooLargeException('image_too_large');
    }
    const isPng =
      image.length >= PNG_MAGIC.length && image.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
    const isJpeg =
      image.length >= JPEG_MAGIC.length && image.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC);
    if (!isPng && !isJpeg) {
      throw new UnsupportedMediaTypeException('image_not_png_or_jpeg');
    }

    let canonical: Buffer;
    try {
      canonical = await sharp(image)
        .resize(SIGNATURE_TARGET_WIDTH, SIGNATURE_TARGET_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: false,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw new BadRequestException('image_unreadable');
    }

    const path = `${envelope.id}/signatures/${signer.id}.png`;
    await this.storage.upload(path, canonical, 'image/png');

    const input: SetSignerSignatureInput = {
      signature_format: meta.format,
      signature_image_path: path,
      signature_font: meta.font ?? null,
      signature_stroke_count: meta.stroke_count ?? null,
      signature_source_filename: meta.source_filename ?? null,
    };
    return this.repo.setSignerSignature(signer.id, input);
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
