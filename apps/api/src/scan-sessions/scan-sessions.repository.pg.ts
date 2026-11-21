import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import { SCAN_SESSION_MACHINE } from 'shared';
import type { Database, ScanSessionsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  SCAN_UPLOAD_CLAIM_STALE_MS,
  ScanSessionsRepository,
  type InsertScanSession,
  type ScanSessionRecord,
} from './scan-sessions.repository';

type Row = Selectable<ScanSessionsTable>;

const iso = (d: Date | string): string => new Date(d).toISOString();

function toRecord(row: Row): ScanSessionRecord {
  return {
    id: row.id,
    owner_id: row.owner_id,
    code_hash: row.code_hash,
    status: row.status,
    storage_key: row.storage_key,
    page_count: row.page_count,
    byte_length: row.byte_length,
    expires_at: iso(row.expires_at),
    received_at: row.received_at === null ? null : iso(row.received_at),
    claimed_at: row.claimed_at === null ? null : iso(row.claimed_at),
    created_at: iso(row.created_at),
  };
}

/** Postgres adapter for `scan_sessions` (migration 0044). */
@Injectable()
export class ScanSessionsPgRepository extends ScanSessionsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async insert(input: InsertScanSession): Promise<ScanSessionRecord> {
    const row = await this.db
      .insertInto('scan_sessions')
      .values({
        id: input.id,
        owner_id: input.owner_id,
        code_hash: input.code_hash,
        expires_at: input.expires_at,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async findByHash(code_hash: string): Promise<ScanSessionRecord | null> {
    const row = await this.db
      .selectFrom('scan_sessions')
      .selectAll()
      .where('code_hash', '=', code_hash)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async countOpen(owner_id: string, now: string): Promise<number> {
    const row = await this.db
      .selectFrom('scan_sessions')
      .select(sql<string>`count(*)`.as('n'))
      .where('owner_id', '=', owner_id)
      // Still waiting for the phone: the states a claim or an upload start from.
      .where('status', 'in', [
        ...SCAN_SESSION_MACHINE.sources('claim'),
        ...SCAN_SESSION_MACHINE.sources('received'),
      ])
      .where('expires_at', '>', new Date(now))
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async claim(id: string, now: string): Promise<string | null> {
    const staleBefore = new Date(Date.parse(now) - SCAN_UPLOAD_CLAIM_STALE_MS);
    const res = await this.db
      .updateTable('scan_sessions')
      .set({ status: 'uploading', claimed_at: now })
      .where('id', '=', id)
      .where('expires_at', '>', new Date(now))
      .where((eb) =>
        eb.or([
          eb('status', 'in', SCAN_SESSION_MACHINE.sources('claim')),
          // A crashed upload: what `release` would have done, then the claim.
          eb.and([
            eb('status', 'in', SCAN_SESSION_MACHINE.sources('release')),
            eb.or([eb('claimed_at', 'is', null), eb('claimed_at', '<=', staleBefore)]),
          ]),
        ]),
      )
      .executeTakeFirst();
    return Number(res.numUpdatedRows) === 1 ? now : null;
  }

  async markReceived(
    id: string,
    claim: string,
    input: { storage_key: string; page_count: number; byte_length: number },
    now: string,
  ): Promise<boolean> {
    const res = await this.db
      .updateTable('scan_sessions')
      .set({
        status: 'received',
        storage_key: input.storage_key,
        page_count: input.page_count,
        byte_length: input.byte_length,
        received_at: now,
      })
      .where('id', '=', id)
      .where('status', 'in', SCAN_SESSION_MACHINE.sources('received'))
      .where('claimed_at', '=', new Date(claim))
      .executeTakeFirst();
    return Number(res.numUpdatedRows) === 1;
  }

  async release(id: string, claim: string): Promise<void> {
    await this.db
      .updateTable('scan_sessions')
      .set({ status: 'pending' })
      .where('id', '=', id)
      .where('status', 'in', SCAN_SESSION_MACHINE.sources('release'))
      .where('claimed_at', '=', new Date(claim))
      .execute();
  }

  async consume(id: string): Promise<boolean> {
    const res = await this.db
      .updateTable('scan_sessions')
      .set({ status: 'consumed' })
      .where('id', '=', id)
      .where('status', 'in', SCAN_SESSION_MACHINE.sources('consume'))
      .executeTakeFirst();
    return Number(res.numUpdatedRows) === 1;
  }

  async listExpired(owner_id: string, now: string, limit: number): Promise<ScanSessionRecord[]> {
    const rows = await this.db
      .selectFrom('scan_sessions')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('expires_at', '<=', new Date(now))
      .orderBy('expires_at', 'asc')
      .limit(limit)
      .execute();
    return rows.map(toRecord);
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .deleteFrom('scan_sessions')
      .where('id', 'in', [...ids])
      .execute();
  }
}
