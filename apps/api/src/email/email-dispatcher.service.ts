import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailSendError, EmailSender, type EmailMessage } from './email-sender';
import { OutboundEmailsRepository, type OutboundEmailRow } from './outbound-emails.repository';
import { TemplateService, type EmailTemplateKind } from './template.service';

export interface DispatchOutcome {
  readonly id: string;
  readonly status: 'sent' | 'retry' | 'failed' | 'skipped';
  readonly provider_id?: string;
  readonly error?: string;
}

export interface FlushResult {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  readonly skipped: number;
  readonly outcomes: ReadonlyArray<DispatchOutcome>;
}

/**
 * Drains the `outbound_emails` queue.
 *
 * One row per call to {@link dispatchOne}: claim (atomically flip to
 * `sending` + bump attempts), render the template, hand to the configured
 * `EmailSender`, then mark `sent` / `pending` (retry) / `failed` (final)
 * based on the outcome.
 *
 * Retry policy: exponential backoff (2^n minutes, capped at 6 hours). After
 * `max_attempts` (default 8) a permanent `failed` state stops retries.
 *
 * The service is deliberately small — the in-process worker loop, the cron
 * endpoint, and the one-shot dev script all call {@link flushOnce}.
 */
@Injectable()
export class EmailDispatcherService {
  private readonly log = new Logger('EmailDispatcher');
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    private readonly repo: OutboundEmailsRepository,
    private readonly sender: EmailSender,
    private readonly templates: TemplateService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.fromAddress = env.EMAIL_FROM_ADDRESS;
    this.fromName = env.EMAIL_FROM_NAME;
  }

  /**
   * Repeatedly claim + send until the queue is empty or `maxBatch` rows
   * have been processed in this call. Returns a tidy summary for the
   * caller (cron endpoint, dev script, tests) to log or surface.
   */
  async flushOnce(maxBatch = 50): Promise<FlushResult> {
    const outcomes: DispatchOutcome[] = [];
    for (let i = 0; i < maxBatch; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await this.dispatchOne();
      if (!outcome) break;
      outcomes.push(outcome);
    }
    const by = { sent: 0, retried: 0, failed: 0, skipped: 0 };
    for (const o of outcomes) {
      if (o.status === 'sent') by.sent += 1;
      else if (o.status === 'retry') by.retried += 1;
      else if (o.status === 'failed') by.failed += 1;
      else by.skipped += 1;
    }
    return {
      claimed: outcomes.length,
      sent: by.sent,
      retried: by.retried,
      failed: by.failed,
      skipped: by.skipped,
      outcomes,
    };
  }

  /**
   * Process one row. Returns null when the queue is empty. Otherwise a
   * dispatch outcome describing what happened (sent / retry / failed /
   * skipped). Exposed directly for tests.
   */
  async dispatchOne(): Promise<DispatchOutcome | null> {
    const claimed = await this.repo.claimNext(new Date());
    if (!claimed) return null;

    try {
      const rendered = this.render(claimed);
      if (!rendered) {
        await this.repo.markFailed(claimed.id, {
          error: `unknown_template_kind:${claimed.kind}`,
          final: true,
        });
        return { id: claimed.id, status: 'failed', error: `unknown_template_kind:${claimed.kind}` };
      }

      const message: EmailMessage = {
        to: { email: claimed.to_email, name: claimed.to_name },
        from: { email: this.fromAddress, name: this.fromName },
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: claimed.id,
      };

      const result = await this.sender.send(message);
      await this.repo.markSent(claimed.id, result.providerId, new Date());
      return { id: claimed.id, status: 'sent', provider_id: result.providerId };
    } catch (err) {
      return this.handleSendError(claimed, err);
    }
  }

  private render(row: OutboundEmailRow): ReturnType<TemplateService['render']> | null {
    if (!TEMPLATE_KINDS.has(row.kind)) return null;
    // The payload is a JSON blob; TemplateService expects a flat map of
    // string|number values. Coerce unknown values defensively — missing
    // vars render as empty strings already.
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(row.payload)) {
      if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
      else if (v !== null && v !== undefined) vars[k] = String(v);
    }
    return this.templates.render(row.kind as EmailTemplateKind, vars);
  }

  private async handleSendError(row: OutboundEmailRow, err: unknown): Promise<DispatchOutcome> {
    const message = err instanceof Error ? err.message : String(err);
    // After `claimNext`, `attempts` in `row` still holds the value it had
    // *after* the increment — so `row.attempts` is the count of attempts
    // made so far (including this one).
    const attemptsSoFar = row.attempts;
    const transient = err instanceof EmailSendError ? err.transient : true;
    const hitsMax = attemptsSoFar >= row.max_attempts;

    if (!transient || hitsMax) {
      await this.repo.markFailed(row.id, { error: message, final: true });
      this.log.warn(
        `outbound_email ${row.id} (${row.kind} → ${row.to_email}) failed ${
          hitsMax ? '(max attempts)' : '(permanent)'
        }: ${message}`,
      );
      return { id: row.id, status: 'failed', error: message };
    }

    const nextAttemptAt = new Date(Date.now() + backoffMs(attemptsSoFar));
    await this.repo.markFailed(row.id, {
      error: message,
      final: false,
      nextAttemptAt,
    });
    this.log.warn(
      `outbound_email ${row.id} (${row.kind} → ${row.to_email}) will retry at ${nextAttemptAt.toISOString()}: ${message}`,
    );
    return { id: row.id, status: 'retry', error: message };
  }
}

const TEMPLATE_KINDS = new Set<string>([
  'invite',
  'reminder',
  'completed',
  'declined_to_sender',
  'withdrawn_to_signer',
  'withdrawn_after_sign',
  'expired_to_sender',
  'expired_to_signer',
]);

/**
 * Exponential backoff: 2 min, 4, 8, 16, 32, 64, 128, 256 — capped at 6h.
 * Returns the delay in milliseconds for an attempt `n` (1-indexed).
 */
export function backoffMs(attemptsSoFar: number): number {
  const base = 2 * 60 * 1000; // 2 minutes
  const capped = Math.min(6 * 60 * 60 * 1000, base * 2 ** Math.max(0, attemptsSoFar - 1));
  return capped;
}
