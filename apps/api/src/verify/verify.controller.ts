import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import type { EnvelopeEvent } from '../envelopes/envelope.entity';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';

/**
 * Public, unauthenticated verification surface. Anyone with the envelope's
 * 13-char short_code can pull the metadata + event timeline + pre-signed
 * URLs for sealed.pdf and audit.pdf. This is the counterpart to the QR
 * code stamped on the audit PDF.
 *
 * What we deliberately expose:
 *   - title, short_code, status, timestamps
 *   - signer name + email + role + status + signed_at / declined_at
 *   - full event timeline (actor_kind + event_type + timestamp; we
 *     redact ip/user_agent since those are PII that the sender's
 *     dashboard already guards)
 *   - sealed_sha256 + original_sha256 for tamper evidence
 *   - 5-minute signed URLs for sealed/audit PDFs (only when sealed)
 *
 * What we redact:
 *   - owner_id
 *   - ip / user_agent on events
 *   - signer decline_reason free-text (only presence flag)
 *   - signature image paths / tokens / anything internal
 */
@Public()
@Controller('verify')
export class VerifyController {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly storage: StorageService,
  ) {}

  @Get(':short_code')
  async verify(@Param('short_code') short_code: string): Promise<VerifyResponse> {
    const envelope = await this.repo.findByShortCode(short_code);
    if (!envelope) throw new NotFoundException('envelope_not_found');

    const events = await this.repo.listEventsForEnvelope(envelope.id);

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
  /** 5-min signed URL. Null if not yet sealed. */
  readonly sealed_url: string | null;
  /** 5-min signed URL. Null if no audit.pdf has been produced. */
  readonly audit_url: string | null;
}
