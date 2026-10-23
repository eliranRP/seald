import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  DuplicateOutboundEmailError,
  OutboundEmailsRepository,
} from '../email/outbound-emails.repository';
import { automatedReminderCadence } from '../email/reminder-cadence';
import { buildSignerListHtmlFromSigners } from '../email/template-fragments';
import { EnvelopesRepository, type ReminderCandidate } from '../envelopes/envelopes.repository';
import { formatExpiresAt } from '../envelopes/envelopes.service';
import { isSignersTurn } from '../signing/signing-order';
import { isAutomatedReminderDue, reminderCadenceFor } from './reminder-eligibility';

export interface ReminderSweepResult {
  readonly queued: number;
  readonly skipped: number;
  /** How many candidate rows this sweep read, including ones it skipped. */
  readonly scanned: number;
}

/**
 * Queues one `reminder` outbox row per unsigned signer whose wait under the
 * envelope's reminder cadence has passed. The default cadence is one day
 * after the invite, then daily. Delivery stays on
 * `EmailWorkerService` (`WORKER_ENABLED`) and `POST /internal/cron/flush-emails`.
 *
 * The stored payload holds the signer id only, never a signing link (MCP
 * Insert A). `EmailDispatcherService` mints a new token when the mail goes
 * out, so the reminder rotates the link and every older one stops
 * working. The audit event is written there too, after the send-time
 * re-check, so a skipped row is not recorded as sent.
 *
 * Candidates already have a non-null `access_token_hash`, which means their
 * invite has gone out; a signer whose invite is still queued is not listed.
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
    if (!envelope || !signer) return false;

    const prior = await this.outbound.listByEnvelope(envelope.id);
    const automatedCount = prior.filter(
      (row) =>
        row.kind === 'reminder' && row.signer_id === signer.id && row.payload['automated'] === true,
    ).length;
    const lastMail = await this.outbound.findLastInviteOrReminder(
      candidate.envelopeId,
      candidate.signerId,
    );
    const cadence = reminderCadenceFor(envelope);
    const due = isAutomatedReminderDue(
      {
        status: envelope.status,
        remindersEnabled: envelope.reminders_enabled,
        expiresAtMs: Date.parse(envelope.expires_at),
        signedAt: signer.signed_at,
        declinedAt: signer.declined_at,
        invitedAtMs: Date.parse(candidate.invitedAt),
        lastRemindedAtMs: candidate.lastRemindedAt ? Date.parse(candidate.lastRemindedAt) : null,
        lastMailAtMs: lastMail ? Date.parse(lastMail.created_at) : null,
        cadence,
        automatedSent: automatedCount,
        stepActive: isSignersTurn(envelope.delivery_mode, envelope.signers, signer.id),
      },
      now.getTime(),
    );
    if (!due) return false;

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
      reminder_cadence: automatedReminderCadence(cadence),
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
