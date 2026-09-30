import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  DuplicateOutboundEmailError,
  OutboundEmailsRepository,
} from '../email/outbound-emails.repository';
import { buildSignerListHtmlFromSigners } from '../email/template-fragments';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { isAutomatedReminderDue } from './reminder-eligibility';

export interface ReminderSweepResult {
  readonly queued: number;
  readonly skipped: number;
  /** How many signers the repository returned before the mail-time filter. */
  readonly scanned: number;
}

/**
 * Queues one `reminder` outbox row per unsigned signer whose last invite
 * or reminder is at least 24 hours old. Delivery stays on
 * `EmailWorkerService` (`WORKER_ENABLED`) and `POST /internal/cron/flush-emails`.
 *
 * The stored payload does not include `sign_url`. Invite and manual-remind
 * rows already persist the plaintext signing token inside that field; this
 * path does not add another copy. `EmailDispatcherService` fills the link
 * at render time from the newest prior invite/reminder that has one, and
 * does not write it back.
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly log = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly outbound: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async enqueueDue(now = new Date(), limit = 50): Promise<ReminderSweepResult> {
    const candidates = await this.repo.listReminderCandidates(now, limit);
    let queued = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const envelope = await this.repo.findByIdWithAll(candidate.envelopeId);
      const signer = envelope?.signers.find((s) => s.id === candidate.signerId) ?? null;
      const lastMail = await this.outbound.findLastInviteOrReminder(
        candidate.envelopeId,
        candidate.signerId,
      );
      const due =
        envelope !== null &&
        signer !== null &&
        isAutomatedReminderDue(
          {
            status: envelope.status,
            remindersEnabled: envelope.reminders_enabled,
            expiresAtMs: Date.parse(envelope.expires_at),
            signedAt: signer.signed_at,
            declinedAt: signer.declined_at,
            invitedAtMs: Date.parse(candidate.invitedAt),
            lastRemindedAtMs: candidate.lastRemindedAt
              ? Date.parse(candidate.lastRemindedAt)
              : null,
            lastMailAtMs: lastMail ? Date.parse(lastMail.created_at) : null,
          },
          now.getTime(),
        );
      if (!due || !envelope || !signer) {
        skipped += 1;
        continue;
      }

      const claimed = await this.repo.tryClaimReminder(candidate.signerId, now);
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const anchor = lastMail?.created_at ?? candidate.invitedAt;
      const event = await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'system',
        event_type: 'reminder_sent',
        metadata: { automated: true },
      });

      const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
      const senderName = envelope.sender_name ?? envelope.sender_email ?? 'The document sender';
      const senderEmail = envelope.sender_email ?? '';
      const payload: Record<string, unknown> = {
        sender_name: senderName,
        sender_email: senderEmail,
        envelope_title: envelope.title,
        verify_url: `${publicUrl}/verify/${envelope.short_code}`,
        short_code: envelope.short_code,
        expires_at_readable: formatUtc(envelope.expires_at),
        public_url: publicUrl,
        signer_list_html: buildSignerListHtmlFromSigners(envelope.signers, {
          highlightEmail: signer.email,
        }),
      };

      try {
        await this.outbound.insert({
          envelope_id: envelope.id,
          signer_id: signer.id,
          kind: 'reminder',
          to_email: signer.email,
          to_name: signer.name,
          source_event_id: event.id,
          dedupe_key: `automated_reminder:${envelope.id}:${signer.id}:${anchor}`,
          payload,
        });
        queued += 1;
      } catch (err) {
        if (err instanceof DuplicateOutboundEmailError) {
          skipped += 1;
          continue;
        }
        this.log.error(
          `reminder enqueue failed envelope=${envelope.id} signer=${signer.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      }
    }

    return { queued, skipped, scanned: candidates.length };
  }
}

function formatUtc(iso: string): string {
  const date = new Date(iso);
  const pad = (num: number): string => num.toString().padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}
