import { Injectable, NotFoundException } from '@nestjs/common';
import type { EnvelopeEvent } from '../envelopes/envelope.entity';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { isValidShortCode } from '../envelopes/short-code';
import { StorageService } from '../storage/storage.service';

/**
 * Public verification of an envelope by short code: metadata, redacted
 * timeline, audit-chain flag, and short-lived sealed/audit URLs.
 * `GET /verify/:short_code` delegates here. The response shape is the
 * wire contract; storage paths and signer tokens stay on the server.
 */
@Injectable()
export class VerifyService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly storage: StorageService,
  ) {}

  async verify(short_code: string): Promise<VerifyResponse> {
    // Validate short_code format before hitting the database — rejects
    // injection payloads and limits enumeration surface (OW-3.2, rule 2.1).
    // Returns 404 (not 400) to avoid leaking format expectations to scanners.
    if (!isValidShortCode(short_code)) {
      throw new NotFoundException('envelope_not_found');
    }
    const envelope = await this.repo.findByShortCode(short_code);
    if (!envelope) throw new NotFoundException('envelope_not_found');

    const events = await this.repo.listEventsForEnvelope(envelope.id);
    const { chain_intact } = await this.repo.verifyEventChain(envelope.id);

    let sealed_url: string | null = null;
    let audit_url: string | null = null;
    if (envelope.status === 'completed') {
      sealed_url = await this.storage.createSignedUrl(`${envelope.id}/sealed.pdf`, 300);
      audit_url = await this.storage.createSignedUrl(`${envelope.id}/audit.pdf`, 300);
    } else if (
      envelope.status === 'declined' ||
      envelope.status === 'expired' ||
      envelope.status === 'canceled'
    ) {
      // Audit PDF may exist even for non-sealed terminal envelopes.
      const exists = await this.storage.exists(`${envelope.id}/audit.pdf`);
      if (exists) {
        audit_url = await this.storage.createSignedUrl(`${envelope.id}/audit.pdf`, 300);
      }
    }

    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        short_code: envelope.short_code,
        status: envelope.status,
        original_pages: envelope.original_pages,
        original_sha256: envelope.original_sha256,
        sealed_sha256: envelope.sealed_sha256,
        tc_version: envelope.tc_version,
        privacy_version: envelope.privacy_version,
        sent_at: envelope.sent_at,
        completed_at: envelope.completed_at,
        expires_at: envelope.expires_at,
      },
      signers: envelope.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        status: s.status,
        signed_at: s.signed_at,
        declined_at: s.declined_at,
      })),
      events: events.map(redactEvent),
      chain_intact,
      sealed_url,
      audit_url,
    };
  }
}

function redactEvent(ev: EnvelopeEvent): RedactedEvent {
  return {
    id: ev.id,
    actor_kind: ev.actor_kind,
    event_type: ev.event_type,
    signer_id: ev.signer_id,
    created_at: ev.created_at,
  };
}

interface RedactedEvent {
  readonly id: string;
  readonly actor_kind: EnvelopeEvent['actor_kind'];
  readonly event_type: EnvelopeEvent['event_type'];
  readonly signer_id: string | null;
  readonly created_at: string;
}

export interface VerifyResponse {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly short_code: string;
    readonly status: string;
    readonly original_pages: number | null;
    readonly original_sha256: string | null;
    readonly sealed_sha256: string | null;
    readonly tc_version: string;
    readonly privacy_version: string;
    readonly sent_at: string | null;
    readonly completed_at: string | null;
    readonly expires_at: string;
  };
  readonly signers: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly status: string;
    readonly signed_at: string | null;
    readonly declined_at: string | null;
  }>;
  readonly events: ReadonlyArray<RedactedEvent>;
  /**
   * Whether the audit-event hash chain (`prev_event_hash` column on
   * envelope_events) is intact. `false` indicates that the underlying
   * row(s) have been mutated, inserted, or deleted out-of-band — i.e.
   * potential tampering with the audit log. `true` means every event row
   * after the genesis is a SHA-256 of the canonical JSON of its
   * predecessor, exactly as written by `appendEvent`. The verify-page UI
   * surfaces this as a green check ("audit chain intact") or a red
   * warning ("audit chain broken — possible tampering").
   */
  readonly chain_intact: boolean;
  /** 5-min signed URL. Null if not yet sealed. */
  readonly sealed_url: string | null;
  /** 5-min signed URL. Null if no audit.pdf has been produced. */
  readonly audit_url: string | null;
}
