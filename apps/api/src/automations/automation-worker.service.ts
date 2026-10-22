import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { backoffMs } from '../email/email-dispatcher.service';
import {
  ACTION_NOT_AVAILABLE,
  AUTOMATION_ACTION_EXECUTORS,
  type AutomationActionExecutors,
  type AutomationActionOutcome,
} from './automation-actions';
import { WebhookSecretsService } from './actions/webhook/webhook-secrets.service';
import { AutomationsPgRepository, type ClaimedAutomationJob } from './automations.repository.pg';
import { automationsActive } from './matcher';

/**
 * A1 shipped the worker off; the webhook action (WP-29) turns the loop on.
 * It still starts only when `WORKER_ENABLED=true`, the
 * `workflowAutomations` flag is on, and `AUTOMATIONS_DISABLED` is not
 * `true`. `flushOnce` works regardless, for tests and a later
 * `POST /internal/cron/flush-automations`.
 */
export const AUTOMATION_WORKER_LOOP_ENABLED = true;

/** Daily maintenance (retired previous webhook secrets). */
export const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60_000;

/** A `running` job whose lock is older than this is claimed again. */
export const STALE_LOCK_MS = 15 * 60_000;
/** Most actions this process runs at once (loop + manual flush together). */
export const MAX_IN_FLIGHT = 2;

export type ProcessedStatus = 'done' | 'retrying' | 'failed';

export interface AutomationFlushResult {
  readonly claimed: number;
  readonly done: number;
  readonly retrying: number;
  readonly failed: number;
}

/**
 * Automation job worker skeleton (design doc § Execution), structured like
 * `EmailWorkerService`: claim one job at a time with `for update skip
 * locked`, run its action, then mark the run done / retrying / failed.
 * Actions are stubs in A1: with no executor registered every claimed job
 * finishes `failed` / `action_not_available` (not retryable) and never
 * touches the network.
 */
@Injectable()
export class AutomationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationWorkerService.name);
  private readonly idleDelayMs = 5000;
  private readonly errorDelayMs = 10000;
  private readonly executors: AutomationActionExecutors;
  private stopping = false;
  private loopPromise: Promise<void> | null = null;
  private inFlight = 0;
  private lastMaintenanceMs = 0;

  constructor(
    private readonly repo: AutomationsPgRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional()
    @Inject(AUTOMATION_ACTION_EXECUTORS)
    executors?: AutomationActionExecutors,
    @Optional() private readonly webhookSecrets?: WebhookSecretsService,
  ) {
    this.executors = executors ?? {};
  }

  /** True when the background loop should run in this process. */
  loopShouldRun(): boolean {
    return (
      AUTOMATION_WORKER_LOOP_ENABLED &&
      this.env.WORKER_ENABLED === true &&
      automationsActive(this.env)
    );
  }

  onModuleInit(): void {
    if (!this.loopShouldRun()) return;
    this.logger.log('AutomationWorker starting');
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.loopPromise) await this.loopPromise;
  }

  /** Claim and run up to `limit` jobs, one at a time (batch of 1 per claim). */
  async flushOnce(limit = 10, now: () => Date = () => new Date()): Promise<AutomationFlushResult> {
    let claimed = 0;
    let done = 0;
    let retrying = 0;
    let failed = 0;
    while (claimed < limit && this.inFlight < MAX_IN_FLIGHT) {
      const at = now();
      this.inFlight += 1;
      try {
        const job = await this.repo.claimNextJob(at, new Date(at.getTime() - STALE_LOCK_MS));
        if (!job) break;
        claimed += 1;
        const status = await this.process(job, at);
        if (status === 'done') done += 1;
        else if (status === 'retrying') retrying += 1;
        else failed += 1;
      } finally {
        this.inFlight -= 1;
      }
    }
    return { claimed, done, retrying, failed };
  }

  /** Run one claimed job's action and record the outcome. */
  async process(job: ClaimedAutomationJob, now: Date): Promise<ProcessedStatus> {
    const base = { job_id: job.job_id, run_id: job.run_id, automation_id: job.automation_id };
    if (job.attempts > job.max_attempts) {
      // A stale `running` job reclaimed after its last attempt.
      await this.repo.failRun({ ...base, slug: 'attempts_exhausted', retryable: true });
      return 'failed';
    }
    const outcome = await this.runAction(job);
    if (outcome.kind === 'done') {
      await this.repo.completeRun({ ...base, response_status: outcome.responseStatus ?? null });
      return 'done';
    }
    const response_status = outcome.responseStatus ?? null;
    if (outcome.kind === 'permanent') {
      await this.repo.failRun({ ...base, slug: outcome.slug, retryable: false, response_status });
      return 'failed';
    }
    if (job.attempts >= job.max_attempts) {
      await this.repo.failRun({ ...base, slug: outcome.slug, retryable: true, response_status });
      return 'failed';
    }
    const delay = Math.max(backoffMs(job.attempts), outcome.retryAfterMs ?? 0);
    await this.repo.retryRun({
      ...base,
      slug: outcome.slug,
      response_status,
      scheduled_for: new Date(now.getTime() + delay),
    });
    return 'retrying';
  }

  private async runAction(job: ClaimedAutomationJob): Promise<AutomationActionOutcome> {
    const executor = this.executors[job.action];
    if (!executor) return { kind: 'permanent', slug: ACTION_NOT_AVAILABLE };
    try {
      return await executor.execute(job);
    } catch {
      return { kind: 'transient', slug: 'action_error' };
    }
  }

  /**
   * Daily pass: clear rotated-out webhook secrets past their 24-hour
   * window (design doc § Signature → Rotation). The executor already stops
   * sending `Seald-Signature-Previous` once the window ends; this removes
   * the ciphertext too.
   */
  async maintenance(now: Date = new Date()): Promise<void> {
    if (now.getTime() - this.lastMaintenanceMs < MAINTENANCE_INTERVAL_MS) return;
    this.lastMaintenanceMs = now.getTime();
    if (this.webhookSecrets) await this.webhookSecrets.clearRetiredPrevious(now);
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.maintenance();
        const result = await this.flushOnce(1);
        if (result.claimed === 0) await sleep(this.idleDelayMs);
      } catch (err) {
        const name = err instanceof Error ? err.name : 'unknown';
        this.logger.error(`automation flush failed (${name})`);
        await sleep(this.errorDelayMs);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
