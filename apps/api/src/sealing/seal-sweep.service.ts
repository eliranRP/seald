import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

/** `all_signed` must be at least this old before the sweep touches it. */
export const SEAL_SWEEP_MIN_AGE_MS = 15 * 60_000;
/** Past this age an envelope is a poison pill: logged, never re-queued. */
export const SEAL_SWEEP_MAX_AGE_MS = 6 * 60 * 60_000;
/** A `running` job older than this is presumed dead (worker crashed). */
export const SEAL_SWEEP_STALE_RUNNING_MS = 15 * 60_000;
/** Worker tick cadence. */
export const SEAL_SWEEP_INTERVAL_MS = 15 * 60_000;
const BATCH_LIMIT = 100;

/**
 * Why an envelope was picked up.
 *  - `no_job`: no `envelope_jobs` row (enqueue was lost after `all_signed`).
 *  - `failed_retryable`: job `failed` but `attempts < max_attempts`.
 *  - `stale_running`: job `running` for > 15 min with attempts left.
 *  - `exhausted`: job terminally failed / stale with no attempts left.
 *    Never re-queued; logged for a human.
 */
export type SealSweepReason = 'no_job' | 'failed_retryable' | 'stale_running' | 'exhausted';

export interface SealSweepCandidate {
  readonly envelopeId: string;
  readonly envelopeStatus: 'sealing' | 'awaiting_others';
  readonly allSignedAt: Date;
  readonly reason: SealSweepReason;
}

export interface FindSealSweepCandidatesInput {
  /** Only envelopes whose `all_signed` event is at or before this instant. */
  readonly signedBefore: Date;
  /** When set, only envelopes whose `all_signed` event is after this instant. */
  readonly signedAfter: Date | null;
  /** `running` jobs started before this instant count as stale. */
  readonly runningStartedBefore: Date;
  readonly limit: number;
}

export abstract class SealSweepRepository {
  /** Stuck sealing candidates, newest `all_signed` first. */
  abstract findCandidates(input: FindSealSweepCandidatesInput): Promise<SealSweepCandidate[]>;

  /**
   * Re-arm one candidate. Idempotent across instances: returns `true` only
   * for the caller that actually changed the job row; a concurrent sweep
   * (or a worker that just claimed the row) gets `false`.
   */
  abstract requeue(candidate: SealSweepCandidate, runningStartedBefore: Date): Promise<boolean>;

  /**
   * `audit_only` jobs (declined / expired envelopes) still `running` since
   * before `runningStartedBefore`: their worker died (on the Edge runtime,
   * a step killed at the CPU or memory limit). With attempts left the job
   * goes back to `pending`; without, it is marked `failed` so it does not
   * sit in `running` for ever. `findCandidates` only covers fully signed
   * envelopes, so nothing else reclaims these.
   */
  abstract reclaimStaleAuditJobs(
    runningStartedBefore: Date,
    limit: number,
  ): Promise<ReadonlyArray<{ readonly envelopeId: string; readonly requeued: boolean }>>;
}

export interface SealSweepResult {
  readonly scanned: number;
  readonly requeued: number;
  readonly requeued_envelope_ids: string[];
  /** Candidates another instance/worker got to first, or exhausted jobs in-window. */
  readonly skipped: number;
  /** Envelopes older than 6 h that are still stuck; logged and left alone. */
  readonly poison: number;
  /** Stale `audit_only` jobs put back to `pending`. */
  readonly audit_requeued: number;
  /** Stale `audit_only` jobs with no attempts left, marked `failed`. */
  readonly audit_failed: number;
}

/**
 * Backstop for the seal pipeline. A completed signing normally enqueues a
 * `seal` job; if that enqueue is lost, the job dies mid-run, or retries are
 * mis-armed, the envelope would sit in `sealing` forever. This sweep finds
 * those and re-arms the (unique-per-envelope) job row so the normal worker
 * picks it up.
 *
 * Multi-instance safety: the job table is unique on `envelope_id`, so a
 * missing row is inserted with ON CONFLICT DO NOTHING, and re-arming uses
 * `for update skip locked` plus a conditional update. Two overlapping sweeps
 * cannot both win.
 */
@Injectable()
export class SealSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SealSweepService.name);
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly repo: SealSweepRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.enabled = env.WORKER_ENABLED === true;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('SealSweep disabled by WORKER_ENABLED=false');
      return;
    }
    this.logger.log('SealSweep starting');
    this.timer = setInterval(() => {
      void this.tick();
    }, SEAL_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One scheduled pass; never throws, never overlaps itself. */
  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const result = await this.sweep();
      if (result.requeued > 0 || result.poison > 0) {
        this.logger.log(
          `sweep requeued=${result.requeued} skipped=${result.skipped} poison=${result.poison}`,
        );
      }
    } catch (err) {
      this.logger.error(`sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.inFlight = false;
    }
  }

  async sweep(now: Date = new Date()): Promise<SealSweepResult> {
    const signedBefore = new Date(now.getTime() - SEAL_SWEEP_MIN_AGE_MS);
    const signedAfter = new Date(now.getTime() - SEAL_SWEEP_MAX_AGE_MS);
    const runningStartedBefore = new Date(now.getTime() - SEAL_SWEEP_STALE_RUNNING_MS);

    const candidates = await this.repo.findCandidates({
      signedBefore,
      signedAfter,
      runningStartedBefore,
      limit: BATCH_LIMIT,
    });

    const requeuedIds: string[] = [];
    let skipped = 0;
    for (const candidate of candidates) {
      if (candidate.reason === 'exhausted') {
        this.logger.warn(
          `seal sweep: envelope ${candidate.envelopeId} job exhausted its attempts; needs manual attention`,
        );
        skipped += 1;
        continue;
      }
      const acted = await this.repo.requeue(candidate, runningStartedBefore);
      if (acted) {
        this.logger.log(
          `seal sweep: re-queued envelope ${candidate.envelopeId} (${candidate.reason})`,
        );
        requeuedIds.push(candidate.envelopeId);
      } else {
        skipped += 1;
      }
    }

    const poisoned = await this.repo.findCandidates({
      signedBefore: signedAfter,
      signedAfter: null,
      runningStartedBefore,
      limit: BATCH_LIMIT,
    });
    for (const p of poisoned) {
      this.logger.warn(
        `seal sweep: poison envelope ${p.envelopeId} stuck in ${p.envelopeStatus} since ${p.allSignedAt.toISOString()} (${p.reason}); older than 6h, leaving alone`,
      );
    }

    const audit = await this.repo.reclaimStaleAuditJobs(runningStartedBefore, BATCH_LIMIT);
    for (const a of audit) {
      const what = a.requeued ? 're-queued' : 'out of attempts, marked failed';
      this.logger.warn(`seal sweep: stale audit_only job for envelope ${a.envelopeId} ${what}`);
    }

    return {
      scanned: candidates.length,
      requeued: requeuedIds.length,
      requeued_envelope_ids: requeuedIds,
      skipped,
      poison: poisoned.length,
      audit_requeued: audit.filter((a) => a.requeued).length,
      audit_failed: audit.filter((a) => !a.requeued).length,
    };
  }
}
