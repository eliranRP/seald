import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailDispatcherService } from './email-dispatcher.service';

/**
 * In-process email queue drainer. Periodically calls
 * `EmailDispatcherService.flushOnce` so completed/invite/reminder emails
 * queued by the sender and sealing flows actually go out without
 * requiring an external cron.
 *
 * Gated on `WORKER_ENABLED` — the same flag that controls the seal job
 * worker. Horizontally-scaled deploys can run a dedicated mail worker
 * instance while keeping API nodes `WORKER_ENABLED=false`. The
 * underlying `flushOnce` claim is atomic via `for update skip locked`,
 * so multiple drainers racing is safe.
 *
 * The cron endpoint `POST /internal/cron/flush-emails` remains available
 * for operators who want external scheduling or a manual kick.
 */
@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private readonly enabled: boolean;
  /** Poll interval when the last flush claimed nothing. */
  private readonly idleDelayMs = 5000;
  /** Back-off on transient error. */
  private readonly errorDelayMs = 10000;
  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly dispatcher: EmailDispatcherService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.enabled = env.WORKER_ENABLED === true;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('EmailWorker disabled by WORKER_ENABLED=false');
      return;
    }
    this.logger.log('EmailWorker starting');
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        const result = await this.dispatcher.flushOnce(50);
        if (result.claimed === 0) {
          await sleep(this.idleDelayMs);
          continue;
        }
        this.logger.log(
          `flushed ${result.claimed} emails: sent=${result.sent} retried=${result.retried} failed=${result.failed} skipped=${result.skipped}`,
        );
        // If the batch was full, loop immediately to drain the backlog;
        // otherwise breathe before the next poll.
        if (result.claimed < 50) await sleep(this.idleDelayMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`flushOnce failed: ${msg}`);
        await sleep(this.errorDelayMs);
      }
    }
    this.logger.log('EmailWorker stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
