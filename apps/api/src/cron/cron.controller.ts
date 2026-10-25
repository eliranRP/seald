import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailDispatcherService, type FlushResult } from '../email/email-dispatcher.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import {
  ReminderSchedulerService,
  type ReminderSweepResult,
} from '../reminders/reminder-scheduler.service';
import { requireFlag } from '../common/feature-flag.guard';
import { SealSweepService, type SealSweepResult } from '../sealing/seal-sweep.service';
import { StepSweepService, type StepSweepResult } from '../signing/step-sweep.service';
import { StagedUploadsService } from '../uploads/staged-uploads.service';
import { isFeatureEnabled } from 'shared';
import {
  AutomationWorkerService,
  type AutomationFlushResult,
} from '../automations/automation-worker.service';
import {
  AutomationMatcherService,
  automationsActive,
  type RescanResult,
} from '../automations/matcher';
import { BulkWorkerService, type BulkFlushResult } from '../bulk/bulk-worker.service';

/**
 * Per-call caps for `tick`. pg_cron calls it every minute on a Supabase Edge
 * Function, whose CPU budget is per worker, so each pass stays small; the
 * next minute picks up the rest (docs/supabase-native-architecture.md).
 */
export const TICK_LIMITS = { reminders: 50, bulkRows: 3, automationRuns: 3 } as const;

export interface TickResult {
  readonly reminders: ReminderSweepResult;
  readonly bulk: BulkFlushResult | null;
  readonly automations: {
    readonly matched: RescanResult;
    readonly runs: AutomationFlushResult;
  } | null;
}

/**
 * Internal cron endpoints. Locked down with a shared-secret header
 * (`X-Cron-Secret`), not a user JWT — these are invoked by the host's
 * cron/systemd timer against the local loopback.
 *
 * CRON_SECRET is mandatory in production (env schema enforces >=32 chars).
 * In test it's optional, but if unset the endpoint refuses.
 */
@Public()
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly envelopes: EnvelopesService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly reminders: ReminderSchedulerService,
    private readonly sealSweep: SealSweepService,
    private readonly stepSweep: StepSweepService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly stagedUploads: StagedUploadsService,
    private readonly bulk: BulkWorkerService,
    private readonly automationWorker: AutomationWorkerService,
    private readonly automationMatcher: AutomationMatcherService,
  ) {}

  /**
   * POST /internal/cron/tick
   *
   * The per-minute work the in-process loops do when WORKER_ENABLED=true,
   * for hosts with no long-lived process (Supabase Edge Functions, where
   * pg_cron calls this). One bounded pass each: queue due reminders, send a
   * few bulk rows, match pending automation triggers and run a few
   * automation actions. Safe to overlap with itself and with the loops:
   * every claim is row-conditional or `skip locked`.
   */
  @Post('tick')
  @HttpCode(200)
  async tick(@Headers('x-cron-secret') secret: string | undefined): Promise<TickResult> {
    this.assertSecret(secret);
    const now = new Date();
    const reminders = await this.reminders.enqueueDue(now, TICK_LIMITS.reminders);
    const bulk = isFeatureEnabled('bulkSend')
      ? await this.bulk.flushOnce(TICK_LIMITS.bulkRows)
      : null;
    const automations = automationsActive(this.env)
      ? {
          matched: await this.automationMatcher.rescan(),
          runs: await this.automationWorker.flushOnce(TICK_LIMITS.automationRuns),
        }
      : null;
    return { reminders, bulk, automations };
  }

  /**
   * POST /internal/cron/daily
   *
   * The once-a-day passes of the automation loops: trigger retention plus a
   * full pending rescan, and clearing rotated-out webhook secrets.
   */
  @Post('daily')
  @HttpCode(200)
  async daily(
    @Headers('x-cron-secret') secret: string | undefined,
  ): Promise<{ automations: ({ deleted: number } & RescanResult) | null }> {
    this.assertSecret(secret);
    if (!automationsActive(this.env)) return { automations: null };
    const now = new Date();
    await this.automationWorker.maintenance(now);
    return { automations: await this.automationMatcher.sweep(now) };
  }

  /**
   * POST /internal/cron/expire
   *
   * Flips every `awaiting_others` envelope whose expires_at has passed to
   * `expired` (row-conditionally), and for each one enqueues an
   * audit_only job so the worker produces the audit.pdf. Batch-limited to
   * 100 envelopes per invocation — if more need processing, the next
   * cron tick picks them up.
   */
  @Post('expire')
  @HttpCode(200)
  async expire(
    @Headers('x-cron-secret') secret: string | undefined,
  ): Promise<{ expired_count: number; envelope_ids: string[] }> {
    this.assertSecret(secret);
    const ids = await this.envelopes.expireDue(new Date(), 100);
    return { expired_count: ids.length, envelope_ids: [...ids] };
  }

  /**
   * POST /internal/cron/flush-emails
   *
   * Drains the `outbound_emails` queue: claims up to 50 due rows, renders
   * each template, hands to the configured `EmailSender`, and marks rows
   * `sent` / `pending` (retry with backoff) / `failed` as appropriate.
   *
   * Intended to be invoked once per minute by a host cron timer. Safe to
   * run concurrently with itself — the claim is atomic via
   * `for update skip locked`.
   */
  @Post('flush-emails')
  @HttpCode(200)
  async flushEmails(@Headers('x-cron-secret') secret: string | undefined): Promise<FlushResult> {
    this.assertSecret(secret);
    return this.emailDispatcher.flushOnce(50);
  }

  /**
   * POST /internal/cron/reminders
   *
   * Queues reminder outbox rows for unsigned signers whose last invite or
   * reminder is at least 24 hours old. Does not send mail itself — the
   * email worker (or `flush-emails`) drains the outbox. Safe to overlap
   * with the in-process ReminderWorker: the claim stamps last_reminded_at.
   */
  @Post('reminders')
  @HttpCode(200)
  async sendReminders(
    @Headers('x-cron-secret') secret: string | undefined,
  ): Promise<ReminderSweepResult> {
    this.assertSecret(secret);
    return this.reminders.enqueueDue(new Date(), 50);
  }

  /**
   * POST /internal/cron/seal-sweep
   *
   * Backstop for the seal pipeline: re-queues fully-signed envelopes whose
   * `all_signed` event is 15 min to 6 h old and whose seal job is missing,
   * failed-with-attempts-left, or stuck `running` > 15 min. Envelopes older
   * than 6 h are logged and left alone. Idempotent and safe to run from
   * several instances (unique-per-envelope job row + skip locked).
   */
  @Post('seal-sweep')
  @HttpCode(200)
  async sweepSeals(@Headers('x-cron-secret') secret: string | undefined): Promise<SealSweepResult> {
    this.assertSecret(secret);
    return this.sealSweep.sweep(new Date());
  }

  /**
   * POST /internal/cron/step-sweep (WP-05, flag `signingOrder`)
   *
   * Backstop for sequential signing: a step marked invited at least 5 min
   * ago whose signers never got an invite row (the after-commit half of
   * the submit or send failed) is claimed and started again. Idempotent:
   * an existing `step_started` is reused and invites are deduped per
   * signer. 404 while the flag is off.
   */
  @Post('step-sweep')
  @HttpCode(200)
  async sweepSteps(@Headers('x-cron-secret') secret: string | undefined): Promise<StepSweepResult> {
    requireFlag('signingOrder');
    this.assertSecret(secret);
    return this.stepSweep.sweep(new Date());
  }

  /**
   * POST /internal/cron/mcp-upload-sweep (WP-19)
   *
   * The MCP staged-upload cleanup pass: deletes expired uploads that were
   * never attached to a draft, with their staging objects. 404 while the
   * `mcpServer` flag is off.
   */
  @Post('mcp-upload-sweep')
  @HttpCode(200)
  async sweepMcpUploads(
    @Headers('x-cron-secret') secret: string | undefined,
  ): Promise<{ deleted: number; objects_failed: number }> {
    requireFlag('mcpServer');
    this.assertSecret(secret);
    return this.stagedUploads.sweepExpired(new Date());
  }

  private assertSecret(provided: string | undefined): void {
    const expected = this.env.CRON_SECRET;
    if (!expected) {
      // Explicit config error — caller shouldn't retry.
      throw new BadRequestException('cron_not_configured');
    }
    if (typeof provided !== 'string' || !safeCompare(provided, expected)) {
      throw new UnauthorizedException('invalid_cron_secret');
    }
  }
}

/**
 * Constant-time string compare for shared secrets. Avoids the early-exit
 * leak in `===` that lets an attacker probe a secret one character at a
 * time with timing measurements.
 *
 * Defence in depth: HMAC-compare both values so the comparison is always
 * the same length (32 bytes) regardless of input. This eliminates the
 * length-oracle that a naive `if (a.length !== b.length) return false`
 * would leak. The HMAC key is ephemeral — it only needs to be consistent
 * within a single comparison, not across requests.
 */
function safeCompare(a: string, b: string): boolean {
  const key = randomBytes(32);
  const hmacA = createHmac('sha256', key).update(a).digest();
  const hmacB = createHmac('sha256', key).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}
