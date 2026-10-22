import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { activeSigningOrder } from './signing-order';
import { SigningOrderService } from './signing-order.service';

/** An invited step must be at least this old before the sweep touches it. */
export const STEP_SWEEP_MIN_AGE_MS = 5 * 60_000;
/** Worker tick cadence. */
export const STEP_SWEEP_INTERVAL_MS = 5 * 60_000;
const BATCH_LIMIT = 100;

/** A sequential step whose invites never went out. */
export interface StalledStep {
  readonly envelopeId: string;
  readonly signingOrder: number;
}

export abstract class StepSweepRepository {
  /**
   * Awaiting sequential envelopes whose active step has a signer with
   * `invited_at` at or before `invitedBefore`, not signed or declined, and
   * no `invite` outbox row created since `invited_at`.
   */
  abstract findStalledSteps(invitedBefore: Date, limit: number): Promise<StalledStep[]>;

  /**
   * Claim one stalled step: in a single row-conditional UPDATE, move
   * `invited_at` to the current time for the step's signers that still match the
   * stalled predicate, and return their ids. Concurrent sweeps queue on
   * the row locks and re-check the predicate, so only one of them gets
   * rows; the others get []. If the winner dies before queuing the mail,
   * the rows match again once that stamp is older than the minimum age.
   */
  abstract claimStalledStep(step: StalledStep, invitedBefore: Date): Promise<string[]>;
}

export interface StepSweepResult {
  readonly scanned: number;
  readonly resumed: number;
  readonly resumed_envelope_ids: string[];
  /** Steps another sweep claimed first, or that moved on since the scan. */
  readonly skipped: number;
}

/**
 * Backstop for sequential signing (WP-05), in the spirit of the seal
 * sweep (WP-02). The submit that completes a step stamps the next step's
 * `invited_at` inside its transaction, then, after commit, appends
 * `step_started` and queues the invites. If that second part fails, the
 * next step is marked invited but nobody got a link, and the envelope
 * would wait forever. The same holds for step 1 if `send` dies between
 * the status flip and its invites.
 *
 * Each pass claims such a step (see `claimStalledStep`) and re-runs the
 * step start idempotently: an existing `step_started` for that step is
 * reused, and invites carry per-signer dedupe keys.
 *
 * The tick runs only with WORKER_ENABLED and the `signingOrder` flag on;
 * `POST /internal/cron/step-sweep` is the cron entry point.
 */
@Injectable()
export class StepSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StepSweepService.name);
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly repo: StepSweepRepository,
    private readonly envelopes: EnvelopesRepository,
    private readonly signingOrder: SigningOrderService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.enabled = env.WORKER_ENABLED === true;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, STEP_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One scheduled pass; never throws, never overlaps itself. */
  async tick(): Promise<void> {
    if (!isFeatureEnabled('signingOrder')) return;
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const result = await this.sweep();
      if (result.resumed > 0) {
        this.logger.log(`step sweep resumed=${result.resumed} skipped=${result.skipped}`);
      }
    } catch (err) {
      this.logger.error(`step sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.inFlight = false;
    }
  }

  async sweep(now: Date = new Date()): Promise<StepSweepResult> {
    const invitedBefore = new Date(now.getTime() - STEP_SWEEP_MIN_AGE_MS);
    const stalled = await this.repo.findStalledSteps(invitedBefore, BATCH_LIMIT);
    const resumed: string[] = [];
    let skipped = 0;
    for (const step of stalled) {
      const envelope = await this.envelopes.findByIdWithAll(step.envelopeId);
      if (
        !envelope ||
        envelope.status !== 'awaiting_others' ||
        envelope.delivery_mode !== 'sequential' ||
        activeSigningOrder(envelope.signers) !== step.signingOrder
      ) {
        skipped += 1;
        continue;
      }
      const claimed = await this.repo.claimStalledStep(step, invitedBefore);
      if (claimed.length === 0) {
        skipped += 1;
        continue;
      }
      await this.signingOrder.resumeStep(envelope, step.signingOrder, claimed);
      this.logger.log(
        `step sweep: resumed envelope ${envelope.id} order ${step.signingOrder} (${claimed.length} invite(s))`,
      );
      resumed.push(envelope.id);
    }
    return {
      scanned: stalled.length,
      resumed: resumed.length,
      resumed_envelope_ids: resumed,
      skipped,
    };
  }
}
