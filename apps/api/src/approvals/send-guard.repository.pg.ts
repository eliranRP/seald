import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  SendGuardRepository,
  type DeliveryHealth,
  type McpSendUsage,
} from './send-guard.repository';

/**
 * Postgres adapter. The counters are derived from rows that already
 * exist: MCP-caused `sent` / `step_started` events carry `metadata.mcp`
 * (and a top-level `new_recipient_count` on send-caused rows), and provider
 * telemetry lands in `email_webhooks` keyed by the outbox row's
 * `provider_id`. No new table.
 *
 * Runs on `DB_TOKEN`, so inside an ambient transaction (the MCP call or
 * the approval decision) the lock and the counts share it.
 */
@Injectable()
export class SendGuardPgRepository extends SendGuardRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async lockOwner(ownerId: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`mcp_sends:${ownerId}`}, 0))`.execute(
      this.db,
    );
  }

  async lockEnvelope(envelopeId: string): Promise<void> {
    await sql`select id from public.envelopes where id = ${envelopeId}::uuid for update`.execute(
      this.db,
    );
  }

  async usageSince(ownerId: string, since: Date): Promise<McpSendUsage> {
    const result = await sql<{ sends: number; new_recipients: number }>`
      with mcp as (
        select e.envelope_id, e.event_type, e.metadata->>'new_recipient_count' as n
          from public.envelope_events e
          join public.envelopes v on v.id = e.envelope_id
         where v.owner_id = ${ownerId}::uuid
           and e.event_type in ('sent', 'step_started')
           and e.metadata ? 'mcp'
           and e.created_at >= ${since.toISOString()}::timestamptz
      ), per_envelope as (
        select envelope_id,
               bool_or(event_type = 'sent') as sent,
               max(case when n ~ '^[0-9]{1,6}$' then n::int else 0 end) as n
          from mcp
         group by envelope_id
      )
      select (count(*) filter (where sent))::int as sends,
             coalesce(sum(n), 0)::int as new_recipients
        from per_envelope`.execute(this.db);
    const row = result.rows[0];
    // WP-26: rows of an approved MCP bulk batch that the worker has not
    // sent yet are already spoken for, so a second approval cannot spend
    // the same daily allowance. A row stops counting here once it is sent
    // (its `sent` event counts above).
    const queued = await sql<{ n: number }>`
      select count(*)::int as n
        from public.bulk_batch_rows r
        join public.bulk_batches b on b.id = r.batch_id
       where b.owner_id = ${ownerId}::uuid
         and b.options ? 'mcp'
         and b.status = 'processing'
         and r.status in ('pending', 'processing')`.execute(this.db);
    return {
      sends: (row?.sends ?? 0) + (queued.rows[0]?.n ?? 0),
      newRecipients: row?.new_recipients ?? 0,
    };
  }

  async deliveryHealthSince(ownerId: string, since: Date): Promise<DeliveryHealth> {
    const at = since.toISOString();
    const result = await sql<{ sent: number; bounced: number; complaints: number }>`
      with mine as (
        select o.provider_id
          from public.outbound_emails o
          join public.envelopes v on v.id = o.envelope_id
         where v.owner_id = ${ownerId}::uuid
           and o.status = 'sent'
           and o.provider_id is not null
           and o.sent_at >= ${at}::timestamptz
      ), events as (
        select w.event_type, w.provider_id
          from public.email_webhooks w
         where w.provider_id in (select provider_id from mine)
           and w.received_at >= ${at}::timestamptz
      )
      select (select count(*) from mine)::int as sent,
             (select count(distinct provider_id) from events
               where event_type = 'email.bounced')::int as bounced,
             (select count(*) from events where event_type = 'email.complained')::int as complaints`.execute(
      this.db,
    );
    const row = result.rows[0];
    return {
      sent: row?.sent ?? 0,
      bounced: row?.bounced ?? 0,
      complaints: row?.complaints ?? 0,
    };
  }
}
