import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  AutomationsCrudRepository,
  type AutomationPatch,
  type AutomationRecord,
  type CursorRow,
  type ListRunsQuery,
  type NewAutomation,
  type PageCursor,
  type RunRecord,
} from './automations-crud.repository';
import { withAutomationTables, type AutomationsDatabase } from './automations.schema';

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

const iso = (v: Date | string): string => new Date(v).toISOString();

type AutomationRow = {
  id: string;
  owner_id: string;
  recipe: string;
  name: string;
  enabled: boolean;
  trigger: AutomationRecord['trigger'];
  action: AutomationRecord['action'];
  scope: AutomationRecord['scope'];
  template_id: string | null;
  config: unknown;
  consecutive_failures: number;
  created_at: Date;
  updated_at: Date;
};

function toRecord(r: AutomationRow): AutomationRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    recipe: r.recipe,
    name: r.name,
    enabled: r.enabled,
    trigger: r.trigger,
    action: r.action,
    scope: r.scope,
    templateId: r.template_id,
    config: parseConfig(r.config),
    consecutiveFailures: r.consecutive_failures,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

@Injectable()
export class AutomationsCrudPgRepository extends AutomationsCrudRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    super();
    this.db = withAutomationTables(db);
  }

  async count(ownerId: string): Promise<number> {
    const row = await this.db
      .selectFrom('automations')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async insert(input: NewAutomation): Promise<AutomationRecord> {
    const row = await this.db
      .insertInto('automations')
      .values({
        owner_id: input.ownerId,
        recipe: input.recipe,
        name: input.name,
        enabled: input.enabled,
        trigger: input.trigger,
        action: input.action,
        scope: input.scope,
        template_id: input.templateId,
        config: JSON.stringify(input.config),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async find(ownerId: string, id: string): Promise<AutomationRecord | null> {
    const row = await this.db
      .selectFrom('automations')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async list(
    ownerId: string,
    limit: number,
    cursor: PageCursor | null,
  ): Promise<CursorRow<AutomationRecord>[]> {
    let q = this.db
      .selectFrom('automations')
      .selectAll()
      .select(sql<string>`updated_at::text`.as('cursor_at'))
      .where('owner_id', '=', ownerId);
    if (cursor) {
      q = q.where(sql<boolean>`(updated_at, id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
    }
    const rows = await q
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute();
    return rows.map((r) => ({ row: toRecord(r), cursor: { at: r.cursor_at, id: r.id } }));
  }

  async update(
    ownerId: string,
    id: string,
    patch: AutomationPatch,
  ): Promise<AutomationRecord | null> {
    const row = await this.db
      .updateTable('automations')
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        // A8: a re-enable starts the failure streak from zero and clears the disable record.
        ...(patch.enabled === true
          ? { consecutive_failures: 0, disabled_at: null, disabled_reason: null }
          : {}),
        ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
        ...(patch.templateId !== undefined ? { template_id: patch.templateId } : {}),
        ...(patch.config !== undefined ? { config: JSON.stringify(patch.config) } : {}),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .returningAll()
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await this.db
      .deleteFrom('automations')
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .execute();
  }

  async ownsTemplate(ownerId: string, templateId: string): Promise<boolean> {
    const res = await sql<{ ok: number }>`
      select 1 as ok from public.templates where id = ${templateId}::uuid and owner_id = ${ownerId}::uuid
    `.execute(this.db);
    return res.rows.length > 0;
  }

  async awaitingApproval(ownerId: string, ids: readonly string[], now: Date): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const keys = ids.map((id) => `automation:${id}`);
    const res = await sql<{ subject_key: string }>`
      select subject_key from public.mcp_approvals
      where owner_id = ${ownerId}::uuid
        and action = 'automation_external_destination'
        and subject_key = any(${keys}::text[])
        and approved_at is null and denied_at is null and failed_at is null and expired_at is null
        and expires_at > ${now.toISOString()}::timestamptz
    `.execute(this.db);
    return new Set(res.rows.map((r) => r.subject_key.slice('automation:'.length)));
  }

  async parkPendingJobs(automationId: string): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const jobs = await trx
        .deleteFrom('automation_jobs')
        .where('automation_id', '=', automationId)
        .where('status', '=', 'pending')
        .returning(['run_id'])
        .execute();
      if (jobs.length === 0) return 0;
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'failed',
          retryable: true,
          last_error: 'recipe_changed',
          finished_at: new Date().toISOString(),
        })
        .where(
          'id',
          'in',
          jobs.map((j) => j.run_id),
        )
        .execute();
      return jobs.length;
    });
  }

  async listRuns(ownerId: string, query: ListRunsQuery): Promise<CursorRow<RunRecord>[]> {
    let q = this.db
      .selectFrom('automation_runs as r')
      .selectAll('r')
      .select(sql<string>`r.created_at::text`.as('cursor_at'))
      .select(
        sql<boolean>`exists (select 1 from public.automation_jobs j where j.run_id = r.id)`.as(
          'has_job',
        ),
      )
      .where('r.owner_id', '=', ownerId);
    if (query.automationId) q = q.where('r.automation_id', '=', query.automationId);
    if (query.status) q = q.where('r.status', '=', query.status);
    if (query.cursor) {
      q = q.where(
        sql<boolean>`(r.created_at, r.id) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`,
      );
    }
    const rows = await q
      .orderBy('r.created_at', 'desc')
      .orderBy('r.id', 'desc')
      .limit(query.limit + 1)
      .execute();
    return rows.map((r) => ({
      row: {
        id: r.id,
        automationId: r.automation_id,
        ownerId: r.owner_id,
        envelopeId: r.envelope_id,
        trigger: r.trigger,
        action: r.action,
        status: r.status,
        retryable: r.retryable,
        attempts: r.attempts,
        lastError: r.last_error,
        responseStatus: r.response_status,
        hasJob: r.has_job,
        createdAt: iso(r.created_at),
        finishedAt: r.finished_at ? iso(r.finished_at) : null,
      },
      cursor: { at: r.cursor_at, id: r.id },
    }));
  }

  async findRun(ownerId: string, runId: string): Promise<RunRecord | null> {
    const row = await this.db
      .selectFrom('automation_runs as r')
      .selectAll('r')
      .select(
        sql<boolean>`exists (select 1 from public.automation_jobs j where j.run_id = r.id)`.as(
          'has_job',
        ),
      )
      .where('r.id', '=', runId)
      .where('r.owner_id', '=', ownerId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      automationId: row.automation_id,
      ownerId: row.owner_id,
      envelopeId: row.envelope_id,
      trigger: row.trigger,
      action: row.action,
      status: row.status,
      retryable: row.retryable,
      attempts: row.attempts,
      lastError: row.last_error,
      responseStatus: row.response_status,
      hasJob: row.has_job,
      createdAt: iso(row.created_at),
      finishedAt: row.finished_at ? iso(row.finished_at) : null,
    };
  }

  async requeueRun(ownerId: string, runId: string): Promise<'queued' | 'noop' | 'refused'> {
    return this.db.transaction().execute(async (trx) => {
      const run = await trx
        .selectFrom('automation_runs')
        .select(['id', 'automation_id', 'status', 'retryable'])
        .where('id', '=', runId)
        .where('owner_id', '=', ownerId)
        .forUpdate()
        .executeTakeFirst();
      if (!run) return 'refused' as const;
      const job = await trx
        .selectFrom('automation_jobs')
        .select('id')
        .where('run_id', '=', runId)
        .executeTakeFirst();
      // A job already exists (a second tap, or a run still working): nothing to do.
      if (job) return 'noop' as const;
      if (run.status !== 'failed' || !run.retryable) return 'refused' as const;
      await trx
        .insertInto('automation_jobs')
        .values({ run_id: runId, automation_id: run.automation_id })
        .onConflict((oc) => oc.column('run_id').doNothing())
        .execute();
      await trx
        .updateTable('automation_runs')
        .set({
          status: 'queued',
          attempts: 0,
          last_error: null,
          response_status: null,
          finished_at: null,
        })
        .where('id', '=', runId)
        .execute();
      return 'queued' as const;
    });
  }
}
