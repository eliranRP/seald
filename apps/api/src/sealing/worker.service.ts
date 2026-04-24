import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { SealingService } from './sealing.service';

/**
 * In-process job worker. Polls `envelope_jobs` for claimable work and
 * dispatches to SealingService. Gated by `WORKER_ENABLED` so you can run a
 * dedicated worker instance separately from API-only instances if you want
 * horizontal scale; by default the single-node deploy just runs everything
 * in one process.
 *
 * Loop shape:
 *   - Claim next job (SKIP LOCKED). If none, sleep 2s then try again.
 *   - Process the job. On success: finishJob. On throw: failJob (which
 *     handles retry-with-backoff internally).
 *   - Shutdown: OnModuleDestroy sets a flag and the loop exits after the
 *     current job finishes (never interrupt mid-PDF).
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly enabled: boolean;
  private readonly idleDelayMs = 2000;
  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly sealing: SealingService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.enabled = env.WORKER_ENABLED === true;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Worker disabled by WORKER_ENABLED=false');
      return;
    }
    this.logger.log('Worker starting');
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
        const job = await this.repo.claimNextJob();
        if (!job) {
          await sleep(this.idleDelayMs);
          continue;
        }
        this.logger.log(
          `claimed job ${job.id} (${job.kind}) envelope=${job.envelope_id} attempt=${job.attempts}`,
        );
        try {
          if (job.kind === 'seal') {
            await this.sealing.processSealJob(job.envelope_id);
          } else {
            await this.sealing.processAuditOnlyJob(job.envelope_id);
          }
          await this.repo.finishJob(job.id);
          this.logger.log(`finished job ${job.id}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`job ${job.id} failed: ${msg}`);
          await this.repo.failJob(job.id, msg);
          // Audit the failure so the sender sees it in their event stream.
          await this.repo
            .appendEvent({
              envelope_id: job.envelope_id,
              actor_kind: 'system',
              event_type: 'job_failed',
              metadata: { job_id: job.id, kind: job.kind, error: msg.slice(0, 500) },
            })
            .catch(() => {
              // Best-effort; don't let event logging failure loop the worker.
            });
        }
      } catch (err) {
        this.logger.error(
          `worker loop error (poll/claim): ${err instanceof Error ? err.message : String(err)}`,
        );
        await sleep(this.idleDelayMs);
      }
    }
    this.logger.log('Worker stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
