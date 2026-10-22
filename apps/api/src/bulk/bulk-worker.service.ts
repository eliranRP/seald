import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { BulkRowProcessor } from './bulk-row-processor.service';
import { BulkSummaryService } from './bulk-summary.service';
import { BulkRepository } from './bulk.repository';

/** Rows a `processing` lock may sit idle before another worker takes it over. */
export const BULK_STALE_LOCK_MS = 10 * 60_000;
/** A row is tried this many times, then it fails as `attempts_exhausted`. */
export const BULK_MAX_ATTEMPTS = 3;
/** Default throttle: envelopes created and sent per minute, across all workers. */
export const BULK_DEFAULT_ROWS_PER_MINUTE = 30;
const WINDOW_MS = 60_000;

export interface BulkFlushResult {
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
  readonly retried: number;
}

/**
 * Bulk-send worker, shaped like `AutomationWorkerService` and the email
 * worker: claim one row at a time with `for update skip locked`, process it,
 * then close the batch when no row is left. It starts only when
 * `WORKER_ENABLED=true` and the `bulkSend` flag is on; `flushOnce` works
 * regardless, for tests.
 *
 * Throttle: at most `BULK_SEND_ROWS_PER_MINUTE` rows are claimed in any
 * rolling minute, counted in the database so it holds across processes and
 * restarts. Each row queues one invite per signer, so this also bounds the
 * outbound mail a batch can add per minute.
 */
@Injectable()
export class BulkWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkWorkerService.name);
  private readonly idleDelayMs = 5000;
  private readonly errorDelayMs = 10000;
  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly repo: BulkRepository,
    private readonly processor: BulkRowProcessor,
    private readonly summary: BulkSummaryService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  loopShouldRun(): boolean {
    return this.env.WORKER_ENABLED === true && isFeatureEnabled('bulkSend');
  }

  rowsPerMinute(): number {
    const configured = this.env.BULK_SEND_ROWS_PER_MINUTE;
    return configured !== undefined && configured >= 1 ? configured : BULK_DEFAULT_ROWS_PER_MINUTE;
  }

  onModuleInit(): void {
    if (!this.loopShouldRun()) return;
    this.logger.log('BulkWorker starting');
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.loopPromise) await this.loopPromise;
  }

  /** Claim and process up to `limit` rows, one at a time. */
  async flushOnce(limit = 10, now: () => Date = () => new Date()): Promise<BulkFlushResult> {
    let claimed = 0;
    let sent = 0;
    let failed = 0;
    let retried = 0;
    while (claimed < limit) {
      const at = now();
      const row = await this.repo.claimNextRow(at, new Date(at.getTime() - BULK_STALE_LOCK_MS), {
        windowStart: new Date(at.getTime() - WINDOW_MS),
        maxPerWindow: this.rowsPerMinute(),
      });
      if (!row) break;
      claimed += 1;
      if (row.attempts > BULK_MAX_ATTEMPTS) {
        await this.repo.markRowFailed(row.id, 'attempts_exhausted');
        failed += 1;
      } else {
        const batch = await this.repo.findBatch(row.batch_id);
        if (!batch) {
          await this.repo.markRowFailed(row.id, 'send_failed');
          failed += 1;
        } else {
          const outcome = await this.processor.process(batch, row, at);
          if (outcome.kind === 'sent') {
            await this.repo.markRowSent(row.id, now());
            sent += 1;
          } else if (outcome.kind === 'failed') {
            await this.repo.markRowFailed(row.id, outcome.code);
            failed += 1;
          } else if (row.attempts >= BULK_MAX_ATTEMPTS) {
            await this.repo.markRowFailed(row.id, 'attempts_exhausted');
            failed += 1;
          } else {
            await this.repo.releaseRow(row.id, outcome.code);
            retried += 1;
          }
        }
      }
      await this.summary.finishAndNotify(row.batch_id, now());
    }
    await this.summary.notifyFinished(20, now());
    return { claimed, sent, failed, retried };
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        const result = await this.flushOnce(1);
        if (result.claimed === 0) await sleep(this.idleDelayMs);
      } catch (err) {
        const name = err instanceof Error ? err.name : 'unknown';
        this.logger.error(`bulk flush failed (${name})`);
        await sleep(this.errorDelayMs);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
