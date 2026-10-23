import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Transaction } from 'kysely';
import { automationTriggerForEvent, isFeatureEnabled } from 'shared';
import type { Database } from '../../db/schema';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { AutomationEventHook, AutomationHookEvent } from './automation-event-hook';
import {
  AutomationsPgRepository,
  type MatchOutcome,
  type TriggerCursor,
} from './automations.repository.pg';

/** Startup rescan looks back this far before the checkpoint. */
export const RESCAN_OVERLAP_MS = 5 * 60_000;
/** Periodic checkpoint rescan, so a thrown match is retried without a restart. */
export const RESCAN_INTERVAL_MS = 60_000;
/** Retention sweep of leftover `matched` triggers, plus a full pending pass. */
export const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
const SCAN_BATCH = 100;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface RescanResult {
  readonly scanned: number;
  readonly matched: number;
  readonly runs: number;
  readonly failed: number;
}

/** True when workflow automations are on: flag set and kill switch off. */
export function automationsActive(env: Pick<AppEnv, 'AUTOMATIONS_DISABLED'>): boolean {
  return isFeatureEnabled('workflowAutomations') && env.AUTOMATIONS_DISABLED !== true;
}

function cursorAfter(a: TriggerCursor, b: TriggerCursor): boolean {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  return ta > tb || (ta === tb && a.event_id > b.event_id);
}

/**
 * Workflow automations matcher (design doc § Shared foundations, A1).
 *
 * - In the event transaction (`recordTrigger`): one pending
 *   `automation_triggers` row, nothing else.
 * - After commit (`afterCommit`): match that trigger into runs and jobs.
 *   Errors are logged and the trigger stays pending.
 * - On startup (when `WORKER_ENABLED`): rescan pending triggers from the
 *   checkpoint minus five minutes, then every minute.
 * - Daily: delete leftover `matched` rows older than 24 h and run a full
 *   pending pass (no checkpoint bound), so no pending trigger is missed.
 *
 * Unique run keys make a second match of the same event a no-op, so every
 * overlap between these paths is safe. Matching never calls the network.
 */
@Injectable()
export class AutomationMatcherService
  implements AutomationEventHook, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AutomationMatcherService.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private scanInFlight: Promise<RescanResult> | null = null;

  constructor(
    private readonly repo: AutomationsPgRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  isActive(): boolean {
    return automationsActive(this.env);
  }

  // ---------- AutomationEventHook ----------

  async recordTrigger(trx: Transaction<Database>, event: AutomationHookEvent): Promise<boolean> {
    if (!this.isActive() || !automationTriggerForEvent(event.event_type)) return false;
    await this.repo.insertPendingTrigger(trx, event.id);
    return true;
  }

  afterCommit(event: AutomationHookEvent): void {
    if (!this.isActive() || !automationTriggerForEvent(event.event_type)) return;
    void this.matchEvent(event.id);
  }

  // ---------- Matching ----------

  /** Match one trigger. Never throws: a failure is logged and returns null. */
  async matchEvent(eventId: string): Promise<MatchOutcome | null> {
    try {
      return await this.repo.matchTrigger(eventId);
    } catch (err) {
      // Error name/code only: driver messages can echo row values.
      const code = (err as { code?: unknown } | null)?.code;
      const name = err instanceof Error ? err.name : 'unknown';
      this.logger.warn(
        `automation match failed for event ${eventId} (${name}${typeof code === 'string' ? ` ${code}` : ''}); trigger stays pending`,
      );
      return null;
    }
  }

  /**
   * Match pending triggers in `(created_at, event_id)` order. `full` scans
   * every pending row; otherwise the scan starts five minutes before the
   * checkpoint. The checkpoint advances only through a contiguous run of
   * successes, so a failed match is picked up again by the next scan.
   * Concurrent calls share one scan.
   */
  rescan(opts: { full?: boolean } = {}): Promise<RescanResult> {
    if (this.scanInFlight) return this.scanInFlight;
    const p = this.doRescan(opts.full === true).finally(() => {
      this.scanInFlight = null;
    });
    this.scanInFlight = p;
    return p;
  }

  private async doRescan(full: boolean): Promise<RescanResult> {
    const checkpoint = await this.repo.getCheckpoint();
    let after: TriggerCursor | null =
      full || !checkpoint
        ? null
        : {
            created_at: new Date(
              Date.parse(checkpoint.created_at) - RESCAN_OVERLAP_MS,
            ).toISOString(),
            event_id: ZERO_UUID,
          };
    let scanned = 0;
    let matched = 0;
    let runs = 0;
    let failed = 0;
    let advanceTo: TriggerCursor | null = null;
    let blocked = false;

    for (;;) {
      const page = await this.repo.listPendingTriggers({ after, limit: SCAN_BATCH });
      for (const trigger of page) {
        scanned += 1;
        const outcome = await this.matchEvent(trigger.event_id);
        if (outcome === null) {
          failed += 1;
          blocked = true;
          continue;
        }
        if (outcome.kind === 'matched') {
          matched += 1;
          runs += outcome.runs;
        }
        if (!blocked) advanceTo = trigger;
      }
      const last = page[page.length - 1];
      if (page.length < SCAN_BATCH || !last) break;
      after = last;
    }

    if (advanceTo && (!checkpoint || cursorAfter(advanceTo, checkpoint))) {
      await this.repo.saveCheckpoint(advanceTo);
    }
    return { scanned, matched, runs, failed };
  }

  /** Daily pass: retention delete of stale `matched` rows, then a full pending scan. */
  async sweep(now: Date = new Date()): Promise<{ deleted: number } & RescanResult> {
    const deleted = await this.repo.sweepMatchedTriggers(
      new Date(now.getTime() - SWEEP_INTERVAL_MS),
    );
    const result = await this.rescan({ full: true });
    return { deleted, ...result };
  }

  // ---------- Lifecycle ----------

  onApplicationBootstrap(): void {
    if (this.env.WORKER_ENABLED !== true || !this.isActive()) return;
    this.logger.log('Automation matcher starting (startup rescan)');
    this.runSafely(() => this.rescan());
    this.schedule(RESCAN_INTERVAL_MS, () => this.rescan());
    this.schedule(SWEEP_INTERVAL_MS, () => this.sweep());
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers.length = 0;
  }

  private schedule(ms: number, fn: () => Promise<unknown>): void {
    const t = setInterval(() => {
      if (this.isActive()) this.runSafely(fn);
    }, ms);
    t.unref();
    this.timers.push(t);
  }

  private runSafely(fn: () => Promise<unknown>): void {
    fn().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : 'unknown';
      this.logger.error(`automation matcher pass failed (${name})`);
    });
  }
}
