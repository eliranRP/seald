import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { automationTriggerForEvent, type AutomationAction, type AutomationTrigger } from 'shared';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from './automations.schema';

/** Position in the pending-trigger scan. `(created_at, event_id)`, never the uuid alone. */
export interface TriggerCursor {
  readonly created_at: string;
  readonly event_id: string;
}

export type MatchOutcome =
  /** The trigger was not pending (already matched, or its event is gone). */
  | { readonly kind: 'not_pending' }
  /** The trigger was consumed. `runs` is how many new runs (and jobs) it inserted. */
  | {
      readonly kind: 'matched';
      readonly runs: number;
      readonly reason: 'recipes' | 'unmapped_event' | 'no_owner';
    };

export interface ClaimedAutomationJob {
  readonly job_id: string;
  readonly run_id: string;
  readonly automation_id: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly owner_id: string;
  readonly envelope_id: string | null;
  readonly event_id: string | null;
  readonly signer_id: string | null;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  readonly config: Record<string, unknown>;
}

export interface FinishRunInput {
  readonly job_id: string;
  readonly run_id: string;
  readonly automation_id: string;
  readonly response_status?: number | null;
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Data access for workflow automations (migration 0031). The matcher half
 * (`insertPendingTrigger`, `listPendingTriggers`, `matchTrigger`) only
 * inserts and deletes rows: it never calls the network. The worker half
 * (`claimNextJob`, `completeRun`, `retryRun`, `failRun`) mirrors the
 * `outbound_emails` / `envelope_jobs` claim pattern with
 * `for update skip locked`.
 */
@Injectable()
export class AutomationsPgRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    this.db = withAutomationTables(db);
  }

  // ---------- Trigger rows (written inside appendEvent) ----------

  /**
   * Insert the pending trigger row for `eventId` on the caller's
   * transaction (the appendEvent transaction). Idempotent on the event id.
   */
  async insertPendingTrigger(trx: Transaction<Database>, eventId: string): Promise<void> {
    await withAutomationTables(trx)
      .insertInto('automation_triggers')
      .values({ event_id: eventId })
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }

  /**
   * Pending triggers strictly after `after` in `(created_at, event_id)`
   * order, oldest first. `after = null` scans every pending row (the
   * partial pending index makes that cheap).
   */
  async listPendingTriggers(opts: {
    after: TriggerCursor | null;
    limit: number;
  }): Promise<TriggerCursor[]> {
    let q = this.db
      .selectFrom('automation_triggers')
      .select(['event_id', 'created_at'])
      .where('status', '=', 'pending');
    const after = opts.after;
    if (after) {
      q = q.where((eb) =>
        eb.or([
          eb('created_at', '>', new Date(after.created_at)),
          eb.and([
            eb('created_at', '=', new Date(after.created_at)),
            eb('event_id', '>', after.event_id),
          ]),
        ]),
      );
    }
    const rows = await q
      .orderBy('created_at', 'asc')
      .orderBy('event_id', 'asc')
      .limit(opts.limit)
      .execute();
    return rows.map((r) => ({ event_id: r.event_id, created_at: toIso(r.created_at) }));
  }

  /**
   * Match one pending trigger into runs and jobs, in one transaction
   * (design doc § Execution, matcher rules 1–5):
   *
   * 1. Load the envelope. A null owner (preserved after account deletion)
   *    matches nothing.
   * 2. Map event_type → trigger. Unmapped types match nothing.
   * 3. Enabled recipes for that owner and trigger, account-scoped or scoped
   *    to the envelope's source template.
   * 4. Insert the run; the dedupe index makes a duplicate a no-op.
   * 5. Insert the job only when the run insert returned a row.
   *
   * The trigger is then marked matched and deleted (the run is the
   * history). A trigger with nothing to do is consumed the same way, so it
   * does not sit in the pending scan forever.
   */
  async matchTrigger(eventId: string): Promise<MatchOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const trigger = await trx
        .selectFrom('automation_triggers')
        .select(['event_id'])
        .where('event_id', '=', eventId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (!trigger) return { kind: 'not_pending' } as const;

      const event = await trx
        .selectFrom('envelope_events')
        .select(['id', 'envelope_id', 'signer_id', 'event_type'])
        .where('id', '=', eventId)
        .executeTakeFirst();
      if (!event) return { kind: 'not_pending' } as const;

      let runs = 0;
      let reason: 'recipes' | 'unmapped_event' | 'no_owner' = 'recipes';
      const mapped = automationTriggerForEvent(event.event_type);
      const envelope = await trx
        .selectFrom('envelopes')
        .select(['owner_id', 'source_template_id'])
        .where('id', '=', event.envelope_id)
        .executeTakeFirst();

      if (!envelope?.owner_id) {
        reason = 'no_owner';
      } else if (!mapped) {
        reason = 'unmapped_event';
      } else {
        const ownerId = envelope.owner_id;
        const templateId = envelope.source_template_id;
        const recipes = await trx
          .selectFrom('automations')
          .select(['id', 'action'])
          .where('owner_id', '=', ownerId)
          .where('enabled', '=', true)
          .where('trigger', '=', mapped)
          .where((eb) =>
            templateId
              ? eb.or([
                  eb('scope', '=', 'account'),
                  eb.and([eb('scope', '=', 'template'), eb('template_id', '=', templateId)]),
                ])
              : eb('scope', '=', 'account'),
          )
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute();

        for (const recipe of recipes) {
          const run = await trx
            .insertInto('automation_runs')
            .values({
              automation_id: recipe.id,
              owner_id: ownerId,
              envelope_id: event.envelope_id,
              event_id: event.id,
              signer_id: event.signer_id,
              trigger: mapped,
              action: recipe.action,
            })
            .onConflict((oc) => oc.doNothing())
            .returning(['id'])
            .executeTakeFirst();
          if (!run) continue;
          await trx
            .insertInto('automation_jobs')
            .values({ run_id: run.id, automation_id: recipe.id })
            .onConflict((oc) => oc.column('run_id').doNothing())
            .execute();
          runs += 1;
        }
      }

      await trx
        .updateTable('automation_triggers')
        .set({ status: 'matched', matched_at: new Date().toISOString() })
        .where('event_id', '=', eventId)
        .execute();
      await trx.deleteFrom('automation_triggers').where('event_id', '=', eventId).execute();
      return { kind: 'matched', runs, reason } as const;
    });
  }

  /** Daily retention pass: `matched` rows the matcher failed to delete. */
  async sweepMatchedTriggers(matchedBefore: Date): Promise<number> {
    const res = await this.db
      .deleteFrom('automation_triggers')
      .where('status', '=', 'matched')
      .where('matched_at', '<', matchedBefore)
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0n);
  }

  async getCheckpoint(): Promise<TriggerCursor | null> {
    const row = await this.db
      .selectFrom('automation_matcher_checkpoint')
      .select(['last_created_at', 'last_event_id'])
      .where('id', '=', 1)
      .executeTakeFirst();
    return row ? { created_at: toIso(row.last_created_at), event_id: row.last_event_id } : null;
  }

  async saveCheckpoint(cursor: TriggerCursor): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insertInto('automation_matcher_checkpoint')
      .values({ last_created_at: cursor.created_at, last_event_id: cursor.event_id })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          last_created_at: cursor.created_at,
          last_event_id: cursor.event_id,
          updated_at: now,
        }),
      )
      .execute();
  }

  // ---------- Jobs (worker) ----------

  /**
   * Claim one due job: `pending` with `scheduled_for <= now` and attempts
   * left, or `running` with `locked_at` older than `staleBefore` (a worker
   * died mid-action). `for update skip locked` so two workers never take
   * the same row. Sets `running`, `locked_at`, bumps `attempts`, and
   * mirrors status and attempts onto the run.
   *
   * A stale job already at `max_attempts` is still claimed, so it cannot
   * stick in `running` forever; the worker finishes it as failed.
   */
  async claimNextJob(now: Date, staleBefore: Date): Promise<ClaimedAutomationJob | null> {
    const nowIso = now.toISOString();
    const staleIso = staleBefore.toISOString();
    const claimed = await sql<{
      id: string;
      run_id: string;
      automation_id: string;
      attempts: number;
      max_attempts: number;
    }>`
      with next_job as (
        select id from public.automation_jobs
        where (
            status = 'pending'
            and scheduled_for <= ${nowIso}::timestamptz
            and attempts < max_attempts
          ) or (
            status = 'running'
            and locked_at < ${staleIso}::timestamptz
          )
        order by scheduled_for asc, created_at asc
        limit 1
        for update skip locked
      )
      update public.automation_jobs j
      set status = 'running',
          locked_at = ${nowIso}::timestamptz,
          attempts = j.attempts + 1
      from next_job
      where j.id = next_job.id
      returning j.id, j.run_id, j.automation_id, j.attempts, j.max_attempts
    `.execute(this.db);
    const job = claimed.rows[0];
    if (!job) return null;

    await this.db
      .updateTable('automation_runs')
      .set({ status: 'running', attempts: job.attempts })
      .where('id', '=', job.run_id)
      .execute();

    const detail = await this.db
      .selectFrom('automation_runs as r')
      .innerJoin('automations as a', 'a.id', 'r.automation_id')
      .select([
        'r.owner_id',
        'r.envelope_id',
        'r.event_id',
        'r.signer_id',
        'r.trigger',
        'r.action',
        'a.config',
      ])
      .where('r.id', '=', job.run_id)
      .executeTakeFirst();
    if (!detail) return null;

    return {
      job_id: job.id,
      run_id: job.run_id,
      automation_id: job.automation_id,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      owner_id: detail.owner_id,
      envelope_id: detail.envelope_id,
      event_id: detail.event_id,
      signer_id: detail.signer_id,
      trigger: detail.trigger,
      action: detail.action,
      config: parseConfig(detail.config),
    };
  }

  /** Success: run `done`, job deleted (the run remains), failure streak reset. */
  async completeRun(input: FinishRunInput): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'done',
          last_error: null,
          response_status: input.response_status ?? null,
          finished_at: new Date().toISOString(),
        })
        .where('id', '=', input.run_id)
        .execute();
      await trx.deleteFrom('automation_jobs').where('id', '=', input.job_id).execute();
      await trx
        .updateTable('automations')
        .set({ consecutive_failures: 0 })
        .where('id', '=', input.automation_id)
        .where('consecutive_failures', '>', 0)
        .execute();
    });
  }

  /** Transient failure with attempts left: run `retrying`, job back to `pending`. */
  async retryRun(
    input: FinishRunInput & { readonly slug: string; readonly scheduled_for: Date },
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'retrying',
          last_error: input.slug,
          response_status: input.response_status ?? null,
        })
        .where('id', '=', input.run_id)
        .execute();
      await trx
        .updateTable('automation_jobs')
        .set({
          status: 'pending',
          locked_at: null,
          scheduled_for: input.scheduled_for.toISOString(),
        })
        .where('id', '=', input.job_id)
        .execute();
    });
  }

  /**
   * Hold a run until `scheduled_for` without spending an attempt (the
   * email-copy daily cap). The run goes back to `queued` with the slug as
   * its reason; the claim's attempt bump is undone so waiting a few days
   * never reaches `max_attempts`.
   */
  async deferRun(
    input: FinishRunInput & { readonly slug: string; readonly scheduled_for: Date },
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'queued',
          last_error: input.slug,
          attempts: sql<number>`greatest(attempts - 1, 0)`,
        })
        .where('id', '=', input.run_id)
        .execute();
      await trx
        .updateTable('automation_jobs')
        .set({
          status: 'pending',
          locked_at: null,
          attempts: sql<number>`greatest(attempts - 1, 0)`,
          scheduled_for: input.scheduled_for.toISOString(),
        })
        .where('id', '=', input.job_id)
        .execute();
    });
  }

  /**
   * Terminal failure: run `failed` with `retryable`, job deleted, failure
   * streak bumped. `retryable` true is the one-tap Retry case (temporary
   * failure out of attempts); false is Fix (permanent failure).
   */
  async failRun(
    input: FinishRunInput & { readonly slug: string; readonly retryable: boolean },
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'failed',
          retryable: input.retryable,
          last_error: input.slug,
          response_status: input.response_status ?? null,
          finished_at: new Date().toISOString(),
        })
        .where('id', '=', input.run_id)
        .execute();
      await trx.deleteFrom('automation_jobs').where('id', '=', input.job_id).execute();
      await trx
        .updateTable('automations')
        .set((eb) => ({ consecutive_failures: eb('consecutive_failures', '+', 1) }))
        .where('id', '=', input.automation_id)
        .execute();
    });
  }
}

function parseConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}
