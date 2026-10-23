import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { AgentActivityItem } from 'shared';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { AgentActivityRepository, type ActivityCursor } from './agent-activity.repository';

/** Event types that are an agent changing something (not reading or viewing). */
const WRITE_EVENT_TYPES = [
  'sent',
  'canceled',
  'reminder_sent',
  'signer_corrected',
  'expiry_changed',
];

interface EventRow {
  readonly id: string;
  readonly envelope_id: string;
  readonly event_type: string;
  readonly at: string;
  readonly title: string | null;
  readonly mcp: Record<string, unknown> | null;
}

interface ApprovalRow {
  readonly id: string;
  readonly action: string;
  readonly tool: string | null;
  readonly envelope_id: string | null;
  readonly at: string;
  readonly key_name: string | null;
  readonly key_prefix: string | null;
  readonly title: string | null;
  readonly outcome: AgentActivityItem['outcome'];
  readonly signed_in: boolean | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Postgres adapter. Reads rows that already exist (events with
 * `metadata.mcp`, `mcp_approvals`), so there is no new table. Runs on
 * `DB_TOKEN` and filters by owner in every query.
 */
@Injectable()
export class AgentActivityPgRepository extends AgentActivityRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async listEvents(
    ownerId: string,
    before: ActivityCursor | null,
    limit: number,
  ): Promise<readonly AgentActivityItem[]> {
    const after = before
      ? sql`and (t.created_at, t.id) < (${before.at}::timestamptz, ${before.id}::uuid)`
      : sql``;
    const result = await sql<EventRow>`
      select t.id, t.envelope_id, t.event_type::text as event_type,
             to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
             t.title, t.mcp
        from (
          select e.id, e.envelope_id, e.event_type, e.created_at, v.title,
                 e.metadata->'mcp' as mcp,
                 row_number() over (
                   partition by e.envelope_id, e.event_type, e.metadata->'mcp'->>'tool'
                   order by e.created_at, e.id
                 ) as rn
            from public.envelope_events e
            join public.envelopes v on v.id = e.envelope_id
           where v.owner_id = ${ownerId}::uuid
             and e.metadata ? 'mcp'
             and e.event_type::text = any(${WRITE_EVENT_TYPES}::text[])
        ) t
       where (t.event_type::text <> 'sent' or t.rn = 1)
         ${after}
       order by t.created_at desc, t.id desc
       limit ${limit}`.execute(this.db);
    return result.rows.map((r) => ({
      id: r.id,
      source: 'event' as const,
      at: r.at,
      key_name: str(r.mcp?.['key_name']),
      key_prefix: str(r.mcp?.['key_prefix']),
      tool: str(r.mcp?.['tool']) ?? r.event_type,
      outcome: 'done' as const,
      envelope_id: r.envelope_id,
      title: r.title,
      approved_by_session:
        typeof r.mcp?.['approved_by_session'] === 'boolean'
          ? (r.mcp['approved_by_session'] as boolean)
          : null,
    }));
  }

  async listApprovals(
    ownerId: string,
    before: ActivityCursor | null,
    limit: number,
    now: Date,
  ): Promise<readonly AgentActivityItem[]> {
    const after = before
      ? sql`and (a.created_at, a.id) < (${before.at}::timestamptz, ${before.id}::uuid)`
      : sql``;
    const result = await sql<ApprovalRow>`
      select a.id, a.action, a.tool, a.envelope_id,
             to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
             coalesce(k.name, a.summary->>'key_name') as key_name,
             k.prefix as key_prefix,
             a.summary->>'title' as title,
             a.decided_signed_in as signed_in,
             case
               when a.denied_at is not null then 'denied'
               when a.failed_at is not null then 'failed'
               when a.expired_at is not null then 'expired'
               when a.completed_at is not null then 'done'
               when a.approved_at is not null then 'waiting'
               when a.expires_at <= ${now.toISOString()}::timestamptz then 'expired'
               else 'waiting'
             end as outcome
        from public.mcp_approvals a
        left join public.api_keys k on k.id = a.api_key_id
       where a.owner_id = ${ownerId}::uuid
         and (a.completed_at is null or a.envelope_id is null)
         ${after}
       order by a.created_at desc, a.id desc
       limit ${limit}`.execute(this.db);
    return result.rows.map((r) => ({
      id: r.id,
      source: 'approval' as const,
      at: r.at,
      key_name: r.key_name,
      key_prefix: r.key_prefix,
      tool: r.tool ?? r.action,
      outcome: r.outcome,
      envelope_id: r.envelope_id,
      title: r.title,
      approved_by_session: r.signed_in,
    }));
  }
}
