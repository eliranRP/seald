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
import { AutomationsPgRepository, type ClaimedAutomationJob } from './automations.repository.pg';
import { automationsActive } from './matcher';

/**
 * A1 ships the worker off. The loop stays down even with
 * `WORKER_ENABLED=true` and the flag on, until the first real action (the
 * webhook, WP-29) flips this. `flushOnce` works regardless, for tests and
 * a later `POST /internal/cron/flush-automations`.
 */
export const AUTOMATION_WORKER_LOOP_ENABLED = false;

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

  constructor(
    private readonly repo: AutomationsPgRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional()
    @Inject(AUTOMATION_ACTION_EXECUTORS)
    executors?: AutomationActionExecutors,
  ) {
    this.executors = executors ?? {};
  }

  onModuleInit(): void {
    if (!AUTOMATION_WORKER_LOOP_ENABLED || this.env.WORKER_ENABLED !== true) return;
    if (!automationsActive(this.env)) return;
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

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
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
