import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { ReminderSchedulerService } from './reminder-scheduler.service';

/**
 * In-process sweep for automated signing reminders. Gated on
 * `WORKER_ENABLED`, same as the seal and email workers. Each pass only
 * enqueues `outbound_emails` rows; `EmailWorkerService` sends them.
 *
 * `POST /internal/cron/reminders` calls the same scheduler for hosts that
 * prefer an external timer. The claim update on `last_reminded_at` makes
 * overlapping sweeps safe.
 */
@Injectable()
export class ReminderWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorkerService.name);
  private readonly enabled: boolean;
  /** Reminders are a 24h cadence; a one-minute poll is enough. */
  private readonly idleDelayMs = 60_000;
  private readonly errorDelayMs = 15_000;
  private readonly batchSize = 50;
  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly scheduler: ReminderSchedulerService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.enabled = env.WORKER_ENABLED === true;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('ReminderWorker disabled by WORKER_ENABLED=false');
      return;
    }
    this.logger.log('ReminderWorker starting');
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
        const result = await this.scheduler.enqueueDue(new Date(), this.batchSize);
        if (result.queued > 0) {
          this.logger.log(
            `queued ${result.queued} reminders (skipped=${result.skipped} scanned=${result.scanned})`,
          );
        }
        // Drain a full batch of newly queued rows immediately. A full batch
        // of skips (for example a recent manual reminder the SQL clocks
        // have not caught up to) must idle, or the loop spins.
        if (result.queued === 0 || result.scanned < this.batchSize) {
          await sleep(this.idleDelayMs);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`enqueueDue failed: ${msg}`);
        await sleep(this.errorDelayMs);
      }
    }
    this.logger.log('ReminderWorker stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
