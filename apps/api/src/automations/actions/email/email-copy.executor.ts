import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import { insertOutboundEmailIdempotent } from '../../../email/insert-idempotent';
import { OutboundEmailsRepository } from '../../../email/outbound-emails.repository';
import type { AutomationActionExecutor, AutomationActionOutcome } from '../../automation-actions';
import type { ClaimedAutomationJob } from '../../automations.repository.pg';
import {
  EMAIL_COPY_DAILY_CAP,
  EMAIL_COPY_DAILY_CAP_SLUG,
  nextUtcMidnight,
  normalizeEmail,
  parseEmailCopyConfig,
  utcDay,
} from './email-copy.config';
import { EmailCopyRepository } from './email-copy.repository';
import { buildEmailCopyPayload } from './email-copy-vars';

/**
 * The `email_copy` action (A7). One attempt = resolve recipients (the
 * recipe's list, or the sender's mailbox when the list is empty), drop
 * addresses that used the stop link, spend the owner's daily quota, then
 * insert one `automation_copy` outbox row per address through
 * `insertOutboundEmailIdempotent` with `automation_copy:<run>:<email>`.
 * The run is done once the rows exist; delivery and its retries belong to
 * `EmailDispatcherService`.
 *
 * Over the 50-a-day cap the run is deferred to the next UTC midnight
 * (slug `email_copy_daily_cap`), never failed, and the attempt is not
 * spent. A missing sender mailbox is permanent (`sender_email_missing`).
 * Slugs only reach the run history: never an address or a title.
 */
@Injectable()
export class EmailCopyActionExecutor implements AutomationActionExecutor {
  private readonly logger = new Logger(EmailCopyActionExecutor.name);

  constructor(
    private readonly repo: EmailCopyRepository,
    private readonly outbound: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(
    job: ClaimedAutomationJob,
    now: Date = new Date(),
  ): Promise<AutomationActionOutcome> {
    const outcome = await this.attempt(job, now);
    if (outcome.kind !== 'done') {
      this.logger.warn(`email_copy run ${job.run_id} ${outcome.kind} ${outcome.slug}`);
    }
    return outcome;
  }

  private async attempt(job: ClaimedAutomationJob, now: Date): Promise<AutomationActionOutcome> {
    if (job.action !== 'email_copy') return { kind: 'permanent', slug: 'bad_config' };
    const config = parseEmailCopyConfig(job.config);
    if (!config.ok) return { kind: 'permanent', slug: config.slug };

    const ctx = await this.repo.loadContext({
      ownerId: job.owner_id,
      envelopeId: job.envelope_id,
      signerId: job.signer_id,
    });
    if (!ctx) return { kind: 'permanent', slug: 'envelope_missing' };

    const senderEmail = normalizeEmail(ctx.envelope.senderEmail);
    if (!senderEmail) return { kind: 'permanent', slug: 'sender_email_missing' };

    const wanted = config.to.length > 0 ? config.to : [senderEmail];
    const suppressed = await this.repo.suppressedAmong(job.owner_id, wanted);
    const recipients = wanted.filter((email) => !suppressed.has(email));
    if (recipients.length === 0) return { kind: 'done' };

    const reserved = await this.repo.reserveSends({
      ownerId: job.owner_id,
      runId: job.run_id,
      emails: recipients,
      day: utcDay(now),
      cap: EMAIL_COPY_DAILY_CAP,
    });
    if (reserved === 'capped') {
      return { kind: 'deferred', slug: EMAIL_COPY_DAILY_CAP_SLUG, until: nextUtcMidnight(now) };
    }

    for (const email of recipients) {
      await insertOutboundEmailIdempotent(this.outbound, {
        envelope_id: ctx.envelope.id,
        signer_id: null,
        kind: 'automation_copy',
        to_email: email,
        to_name: email,
        source_event_id: job.event_id,
        dedupe_key: `automation_copy:${job.run_id}:${email}`,
        payload: buildEmailCopyPayload({
          automationId: job.automation_id,
          ownerId: job.owner_id,
          trigger: job.trigger,
          envelopeId: ctx.envelope.id,
          envelopeTitle: ctx.envelope.title,
          envelopeStatus: ctx.envelope.status,
          shortCode: ctx.envelope.shortCode,
          signerName: ctx.signerName,
          senderEmail,
          senderName: ctx.envelope.senderName,
          recipient: email,
          appPublicUrl: this.env.APP_PUBLIC_URL,
        }),
      });
    }
    return { kind: 'done' };
  }
}
