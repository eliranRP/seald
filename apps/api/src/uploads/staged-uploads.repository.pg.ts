import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, McpUploadsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  StagedUploadsRepository,
  type CompleteOutcome,
  type CompleteStagedUpload,
  type InsertStagedUpload,
  type StagedUploadRecord,
} from './staged-uploads.repository';

type Row = Selectable<McpUploadsTable>;

const iso = (d: Date | string): string => new Date(d).toISOString();
const isoOrNull = (d: Date | string | null): string | null => (d === null ? null : iso(d));

function toRecord(row: Row): StagedUploadRecord {
  return {
    id: row.id,
    owner_id: row.owner_id,
    storage_key: row.storage_key,
    filename: row.filename,
    mime: row.mime,
    sha256: row.sha256,
    byte_length: row.byte_length,
    page_count: row.page_count,
    thumbnail_url: row.thumbnail_url,
    source: row.source,
    drive_file_id: row.drive_file_id,
    drive_file_name: row.drive_file_name,
    conversion_job_id: row.conversion_job_id,
    expires_at: iso(row.expires_at),
    completed_at: isoOrNull(row.completed_at),
    consumed_at: isoOrNull(row.consumed_at),
    created_at: iso(row.created_at),
  };
}

/** Postgres adapter for `mcp_uploads` (migration 0029). */
@Injectable()
export class StagedUploadsPgRepository extends StagedUploadsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async insert(input: InsertStagedUpload): Promise<StagedUploadRecord> {
    const row = await this.db
      .insertInto('mcp_uploads')
      .values({
        id: input.id,
        owner_id: input.owner_id,
        storage_key: input.storage_key,
        filename: input.filename,
        source: input.source,
        drive_file_id: input.drive_file_id ?? null,
        drive_file_name: input.drive_file_name ?? null,
        expires_at: input.expires_at,
        mime: null,
        sha256: null,
        byte_length: null,
        page_count: null,
        thumbnail_url: null,
        conversion_job_id: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async find(owner_id: string, id: string): Promise<StagedUploadRecord | null> {
    const row = await this.db
      .selectFrom('mcp_uploads')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async findByJob(owner_id: string, job_id: string): Promise<StagedUploadRecord | null> {
    const row = await this.db
      .selectFrom('mcp_uploads')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('conversion_job_id', '=', job_id)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async setConversionJob(owner_id: string, id: string, job_id: string): Promise<void> {
    await sql`update public.mcp_uploads set conversion_job_id = ${job_id}::uuid
               where id = ${id}::uuid and owner_id = ${owner_id}::uuid`.execute(this.db);
  }

  async complete(input: CompleteStagedUpload): Promise<CompleteOutcome> {
    return this.db.transaction().execute(async (trx) => {
      // Same lock shape the send path will take (owner id), so a burst
      // of completes cannot each pass the count before any commits.
      await sql`select pg_advisory_xact_lock(hashtextextended(${`mcp_uploads:${input.owner_id}`}, 0))`.execute(
        trx,
      );
      const counted = await sql<{ n: string }>`
        select count(*)::text as n from public.mcp_uploads
         where owner_id = ${input.owner_id}::uuid
           and completed_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`.execute(
        trx,
      );
      if (Number(counted.rows[0]?.n ?? 0) >= input.daily_cap) return 'daily_cap';
      const done = await sql<{ id: string }>`
        update public.mcp_uploads
           set completed_at = now(), mime = ${input.mime}, sha256 = ${input.sha256},
               byte_length = ${input.byte_length}, page_count = ${input.page_count}
         where id = ${input.id}::uuid and owner_id = ${input.owner_id}::uuid
           and completed_at is null
        returning id`.execute(trx);
      return done.rows.length > 0 ? 'completed' : 'not_pending';
    });
  }

  async countCompletedSince(owner_id: string, since: string): Promise<number> {
    const res = await sql<{ n: string }>`
      select count(*)::text as n from public.mcp_uploads
       where owner_id = ${owner_id}::uuid and completed_at >= ${since}::timestamptz`.execute(
      this.db,
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  async consume(owner_id: string, id: string): Promise<StagedUploadRecord | null> {
    const res = await sql<Row>`
      update public.mcp_uploads set consumed_at = now()
       where id = ${id}::uuid and owner_id = ${owner_id}::uuid
         and completed_at is not null and consumed_at is null and expires_at > now()
      returning *`.execute(this.db);
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async releaseClaim(owner_id: string, id: string): Promise<void> {
    await sql`update public.mcp_uploads set consumed_at = null
               where id = ${id}::uuid and owner_id = ${owner_id}::uuid`.execute(this.db);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    await this.db
      .deleteFrom('mcp_uploads')
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .execute();
  }

  async listExpiredUnattached(
    now: string,
    limit: number,
  ): Promise<ReadonlyArray<StagedUploadRecord>> {
    const rows = await this.db
      .selectFrom('mcp_uploads')
      .selectAll()
      .where('consumed_at', 'is', null)
      .where(sql<boolean>`expires_at <= ${now}::timestamptz`)
      .orderBy('expires_at', 'asc')
      .limit(limit)
      .execute();
    return rows.map(toRecord);
  }

  async deleteMany(ids: ReadonlyArray<string>): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.db
      .deleteFrom('mcp_uploads')
      .where('id', 'in', [...ids])
      .where('consumed_at', 'is', null)
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  async listStorageKeys(owner_id: string): Promise<ReadonlyArray<string>> {
    const rows = await this.db
      .selectFrom('mcp_uploads')
      .select('storage_key')
      .where('owner_id', '=', owner_id)
      .execute();
    return rows.map((r) => r.storage_key);
  }

  async setDocumentDriveSource(
    envelope_id: string,
    document_id: string,
    drive_file_name: string,
  ): Promise<void> {
    await this.db
      .updateTable('envelope_documents')
      .set({ source_drive_file_name: drive_file_name })
      .where('envelope_id', '=', envelope_id)
      .where('id', '=', document_id)
      .execute();
  }
}
