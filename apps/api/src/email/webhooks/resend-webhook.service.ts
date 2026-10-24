import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { insertOutboundEmailIdempotent, sameMailbox } from '../insert-idempotent';
import { OutboundEmailsRepository } from '../outbound-emails.repository';

/** Longest provider message kept on the signer row and in the audit event. */
const MAX_REASON_CHARS = 300;

export type ResendWebhookOutcome =
  | 'bounce_recorded'
  | 'ignored_event'
  | 'ignored_soft_bounce'
  | 'ignored_unknown_email'
  | 'ignored_not_signer_mail'
  | 'ignored_address_changed'
  | 'ignored_already_handled';

interface ResendBounceData {
  readonly email_id?: unknown;
  readonly to?: unknown;
  readonly bounce?: { readonly type?: unknown; readonly message?: unknown } | null;
}

/**
 * Handles verified Resend webhook events (`POST /webhooks/resend`).
 *
 * Every event lands in `email_webhooks` (provider telemetry that the MCP
 * send guard already reads, keyed by `provider_id`). A hard bounce
 * (`email.bounced`, bounce type Permanent) on signer mail also:
 *   1. marks the signer `delivery_status = 'bounced'`,
 *   2. appends an `email_bounced` event (joins the audit hash chain, S.6),
 *   3. queues `bounced_to_sender` so the sender can fix the address.
 *
 * Replays are safe: the signer update only matches a signer still marked
 * delivered, and the sender mail carries a dedupe key.
 */
@Injectable()
export class ResendWebhookService {
  private readonly log = new Logger('ResendWebhook');
  private readonly publicUrl: string;

  constructor(
    private readonly outbound: OutboundEmailsRepository,
    private readonly envelopes: EnvelopesRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  }

  async handle(event: {
    readonly type?: unknown;
    readonly data?: unknown;
  }): Promise<ResendWebhookOutcome> {
    const type = typeof event.type === 'string' ? event.type : '';
    const data = (event.data ?? {}) as ResendBounceData;
    const providerId = typeof data.email_id === 'string' ? data.email_id : '';
    if (type && providerId) await this.recordTelemetry(type, providerId, event);
    if (type !== 'email.bounced') return 'ignored_event';
    if (!providerId) return 'ignored_unknown_email';
    if (data.bounce?.type !== 'Permanent') return 'ignored_soft_bounce';
    return this.recordBounce(providerId, bounceReason(data));
  }

  private async recordTelemetry(
    type: string,
    providerId: string,
    event: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    try {
      await this.outbound.recordProviderEvent('resend', type, providerId, event);
    } catch (err) {
      // Telemetry only. Never fail the delivery over it.
      this.log.warn(
        `email_webhooks insert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async recordBounce(
    providerId: string,
    reason: string | null,
  ): Promise<ResendWebhookOutcome> {
    const row = await this.outbound.findByProviderId(providerId);
    if (!row) return 'ignored_unknown_email';
    if (!row.envelope_id || !row.signer_id) return 'ignored_not_signer_mail';
    const envelope = await this.envelopes.findByIdWithAll(row.envelope_id);
    const signer = envelope?.signers.find((s) => s.id === row.signer_id);
    if (!envelope || !signer) return 'ignored_unknown_email';
    // The sender already fixed the address; this bounce is about the old one.
    if (!sameMailbox(signer.email, row.to_email)) return 'ignored_address_changed';

    const marked = await this.envelopes.markSignerBounced(signer.id, reason, new Date());
    if (!marked) return 'ignored_already_handled';

    const event = await this.envelopes.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'system',
      event_type: 'email_bounced',
      metadata: { email: row.to_email, reason, outbound_email_id: row.id, kind: row.kind },
    });

    const senderEmail = envelope.sender_email;
    if (senderEmail && envelope.status === 'awaiting_others') {
      await insertOutboundEmailIdempotent(this.outbound, {
        envelope_id: envelope.id,
        signer_id: null,
        kind: 'bounced_to_sender',
        to_email: senderEmail,
        to_name: envelope.sender_name ?? senderEmail,
        source_event_id: event.id,
        dedupe_key: `bounced_to_sender:${envelope.id}:${signer.id}:${row.id}`,
        payload: {
          signer_name: signer.name,
          bounced_email: row.to_email,
          bounce_reason: reason ?? '',
          envelope_title: envelope.title,
          dashboard_url: `${this.publicUrl}/document/${envelope.id}`,
          short_code: envelope.short_code,
          public_url: this.publicUrl,
        },
      });
    }
    return 'bounce_recorded';
  }
}

function bounceReason(data: ResendBounceData): string | null {
  const message = data.bounce?.message;
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  return trimmed ? trimmed.slice(0, MAX_REASON_CHARS) : null;
}
