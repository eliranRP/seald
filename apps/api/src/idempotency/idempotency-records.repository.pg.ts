import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  IdempotencyRecordsRepository,
  type ClaimInput,
  type ClaimOutcome,
  type IdempotencyRecord,
} from './idempotency-records.repository';

interface Row {
  request_hash: string;
  path: string;
  completed_at: Date | null;
  response_status: number;
  response_body: unknown;
  created_at: Date;
}

/**
 * Postgres adapter. The claim is one statement: an insert, or an update
 * of a row that has expired or whose claim went stale (same request
 * hash). `on conflict ... do update ... where` returns no row when the
 * existing row is live, and the caller then reads it.
 */
@Injectable()
export class IdempotencyRecordsPgRepository extends IdempotencyRecordsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async claim(input: ClaimInput, attempt = 0): Promise<ClaimOutcome> {
    const claimed = await sql<{ claimed: boolean }>`
      insert into public.idempotency_records
        (user_id, idempotency_key, method, path, request_hash, response_status,
         response_body, created_at, expires_at, completed_at)
      values (${input.user_id}::uuid, ${input.idempotency_key}, ${input.method}, ${input.path},
              ${input.request_hash}, 0, '{}'::jsonb, now(),
              now() + make_interval(secs => ${input.ttl_seconds}), null)
      on conflict (user_id, idempotency_key) do update
         set method = excluded.method,
             path = excluded.path,
             request_hash = excluded.request_hash,
             response_status = 0,
             response_body = '{}'::jsonb,
             created_at = now(),
             expires_at = excluded.expires_at,
             completed_at = null
       where public.idempotency_records.expires_at <= now()
          or (public.idempotency_records.completed_at is null
              and public.idempotency_records.request_hash = excluded.request_hash
              and public.idempotency_records.created_at
                  < now() - make_interval(secs => ${input.stale_claim_seconds}))
      returning true as claimed`.execute(this.db);
    if (claimed.rows.length > 0) return { claimed: true };

    const row = await this.db
      .selectFrom('idempotency_records')
      .select([
        'request_hash',
        'path',
        'completed_at',
        'response_status',
        'response_body',
        'created_at',
      ])
      .where('user_id', '=', input.user_id)
      .where('idempotency_key', '=', input.idempotency_key)
      .executeTakeFirst();
    if (!row) {
      // Released between the two statements; claim once more.
      if (attempt >= 2) throw new Error('idempotency_claim_race');
      return this.claim(input, attempt + 1);
    }
    return { claimed: false, existing: toRecord(row as Row) };
  }

  async complete(
    user_id: string,
    idempotency_key: string,
    response_status: number,
    response_body: unknown,
  ): Promise<void> {
    await this.db
      .updateTable('idempotency_records')
      .set({
        response_status,
        response_body: JSON.stringify(response_body),
        completed_at: new Date().toISOString(),
      })
      .where('user_id', '=', user_id)
      .where('idempotency_key', '=', idempotency_key)
      .where('completed_at', 'is', null)
      .execute();
  }

  async release(user_id: string, idempotency_key: string): Promise<void> {
    await this.db
      .deleteFrom('idempotency_records')
      .where('user_id', '=', user_id)
      .where('idempotency_key', '=', idempotency_key)
      .where('completed_at', 'is', null)
      .execute();
  }
}

function toRecord(row: Row): IdempotencyRecord {
  return {
    request_hash: row.request_hash,
    path: row.path,
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    response_status: row.response_status,
    response_body: row.response_body,
    created_at: new Date(row.created_at).toISOString(),
  };
}
