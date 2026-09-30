import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  DuplicateOutboundEmailError,
  OutboundEmailsRepository,
} from '../email/outbound-emails.repository';
import { AUTOMATED_REMINDER_CADENCE } from '../email/reminder-cadence';
import { buildSignerListHtmlFromSigners } from '../email/template-fragments';
import { EnvelopesRepository, type ReminderCandidate } from '../envelopes/envelopes.repository';
import { formatExpiresAt } from '../envelopes/envelopes.service';
import { isAutomatedReminderDue, MAX_AUTOMATED_REMINDERS } from './reminder-eligibility';

export interface ReminderSweepResult {
  readonly queued: number;
  readonly skipped: number;
  /** How many candidate rows this sweep read, including ones it skipped. */
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
 * does not write it back. The audit event is written there too, after the
 * send-time re-check, so a skipped row is not recorded as sent.
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
    let queued = 0;
    let skipped = 0;
    let scanned = 0;
    let offset = 0;
    const maxScan = limit * 20;

    while (queued < limit && scanned < maxScan) {
      const page = await this.repo.listReminderCandidates(now, limit, offset);
      if (page.length === 0) break;
      offset += page.length;
      scanned += page.length;
      for (const candidate of page) {
        if (queued >= limit) break;
        const didQueue = await this.enqueueCandidate(candidate, now);
        if (didQueue) queued += 1;
        else skipped += 1;
      }
    }

    return { queued, skipped, scanned };
  }

  private async enqueueCandidate(candidate: ReminderCandidate, now: Date): Promise<boolean> {
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
          lastRemindedAtMs: candidate.lastRemindedAt ? Date.parse(candidate.lastRemindedAt) : null,
          lastMailAtMs: lastMail ? Date.parse(lastMail.created_at) : null,
        },
        now.getTime(),
      );
    if (!due || !envelope || !signer) return false;

    const prior = await this.outbound.listByEnvelope(envelope.id);
    const automatedCount = prior.filter(
      (row) =>
        row.kind === 'reminder' && row.signer_id === signer.id && row.payload['automated'] === true,
    ).length;
    if (automatedCount >= MAX_AUTOMATED_REMINDERS) return false;

    const signUrl = await this.outbound.findLatestSignUrl(envelope.id, signer.id);
    if (!signUrl) {
      this.log.warn(
        `reminder skipped missing_sign_url envelope=${envelope.id} signer=${signer.id}`,
      );
      return false;
    }

    const claimed = await this.repo.tryClaimReminder(candidate.signerId, now);
    if (!claimed) return false;

    const anchor = lastMail?.created_at ?? candidate.invitedAt;
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const senderName = envelope.sender_name ?? envelope.sender_email ?? 'The document sender';
    const senderEmail = envelope.sender_email ?? '';
    const payload: Record<string, unknown> = {
      sender_name: senderName,
      sender_email: senderEmail,
      envelope_title: envelope.title,
      verify_url: `${publicUrl}/verify/${envelope.short_code}`,
      short_code: envelope.short_code,
      expires_at_readable: formatExpiresAt(envelope.expires_at),
      public_url: publicUrl,
      automated: true,
      reminder_cadence: AUTOMATED_REMINDER_CADENCE,
      signer_list_html: buildSignerListHtmlFromSigners(envelope.signers, {
        highlightEmail: signer.email,
        showEmails: false,
      }),
    };

    try {
      await this.outbound.insert({
        envelope_id: envelope.id,
        signer_id: signer.id,
        kind: 'reminder',
        to_email: signer.email,
        to_name: signer.name,
        dedupe_key: `automated_reminder:${envelope.id}:${signer.id}:${anchor}`,
        payload,
      });
      return true;
    } catch (err) {
      if (err instanceof DuplicateOutboundEmailError) return false;
      this.log.error(
        `reminder enqueue failed envelope=${envelope.id} signer=${signer.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
