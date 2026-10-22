import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { BulkRecipient, BulkRowError } from 'shared';
import type { BulkBatchesTable, BulkBatchRowsTable, Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  BulkRepository,
  type BulkBatchRecord,
  type BulkOptions,
  type BulkRowRecord,
  type ClaimThrottle,
  type NewBulkBatch,
  type NewBulkRow,
} from './bulk.repository';

function iso(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function toBatch(r: Selectable<BulkBatchesTable>): BulkBatchRecord {
  return {
    id: r.id,
    owner_id: r.owner_id,
    template_id: r.template_id,
    template_title: r.template_title,
    sender_email: r.sender_email,
    sender_name: r.sender_name,
    status: r.status,
    filename: r.filename,
    csv_sha256: r.csv_sha256,
    slot_count: r.slot_count,
    total_rows: r.total_rows,
    valid_rows: r.valid_rows,
    options: r.options as BulkOptions,
    column_errors: r.column_errors as BulkRowError[],
    ignored_columns: r.ignored_columns,
    created_at: iso(r.created_at) as string,
    confirmed_at: iso(r.confirmed_at),
    completed_at: iso(r.completed_at),
    canceled_at: iso(r.canceled_at),
    notified_at: iso(r.notified_at),
  };
}

function toRow(r: Selectable<BulkBatchRowsTable>): BulkRowRecord {
  return {
    id: r.id,
    batch_id: r.batch_id,
    row_index: r.row_index,
    status: r.status,
    recipients: r.recipients as BulkRecipient[],
    title: r.title,
    errors: r.errors as BulkRowError[],
    envelope_id: r.envelope_id,
    attempts: r.attempts,
    locked_at: iso(r.locked_at),
    error_code: r.error_code,
    sent_at: iso(r.sent_at),
  };
}

@Injectable()
export class BulkPgRepository extends BulkRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async createPreview(
    batch: NewBulkBatch,
    rows: ReadonlyArray<NewBulkRow>,
  ): Promise<BulkBatchRecord> {
    return this.db.transaction().execute(async (trx) => {
      const valid = rows.filter((r) => r.errors.length === 0).length;
      const inserted = await trx
        .insertInto('bulk_batches')
        .values({
          owner_id: batch.owner_id,
          template_id: batch.template_id,
          template_title: batch.template_title,
          sender_email: batch.sender_email,
          sender_name: batch.sender_name,
          filename: batch.filename,
          csv_sha256: batch.csv_sha256,
          slot_count: batch.slot_count,
          total_rows: rows.length,
          valid_rows: valid,
          options: JSON.stringify(batch.options),
          column_errors: JSON.stringify(batch.column_errors),
          ignored_columns: JSON.stringify(batch.ignored_columns),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (rows.length > 0) {
        await trx
          .insertInto('bulk_batch_rows')
          .values(
            rows.map((r) => ({
              batch_id: inserted.id,
              row_index: r.row_index,
              status: r.errors.length === 0 ? ('pending' as const) : ('invalid' as const),
              recipients: JSON.stringify(r.recipients),
              title: r.title,
              errors: JSON.stringify(r.errors),
            })),
          )
          .execute();
      }
      return toBatch(inserted);
    });
  }

  async findBatchForOwner(owner_id: string, id: string): Promise<BulkBatchRecord | null> {
    const row = await this.db
      .selectFrom('bulk_batches')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', owner_id)
      .executeTakeFirst();
    return row ? toBatch(row) : null;
  }

  async findBatch(id: string): Promise<BulkBatchRecord | null> {
    const row = await this.db
      .selectFrom('bulk_batches')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toBatch(row) : null;
  }

  async listRows(batch_id: string): Promise<ReadonlyArray<BulkRowRecord>> {
    const rows = await this.db
      .selectFrom('bulk_batch_rows')
      .selectAll()
      .where('batch_id', '=', batch_id)
      .orderBy('row_index', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async confirm(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null> {
    const row = await this.db
      .updateTable('bulk_batches')
      .set({ status: 'processing', confirmed_at: now.toISOString() })
      .where('id', '=', id)
      .where('owner_id', '=', owner_id)
      .where('status', '=', 'preview')
      .where('valid_rows', '>', 0)
      .returningAll()
      .executeTakeFirst();
    return row ? toBatch(row) : null;
  }

  async cancel(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('bulk_batches')
        .select(['status', 'confirmed_at'])
        .where('id', '=', id)
        .where('owner_id', '=', owner_id)
        .forUpdate()
        .executeTakeFirst();
      if (!existing || (existing.status !== 'preview' && existing.status !== 'processing')) {
        return null;
      }
      // A preview that never ran has nothing to report, so it needs no summary.
      const neverRan = existing.status === 'preview';
      const ts = now.toISOString();
      const row = await trx
        .updateTable('bulk_batches')
        .set({
          status: 'canceled',
          canceled_at: ts,
          ...(neverRan ? { completed_at: ts, notified_at: ts } : {}),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('bulk_batch_rows')
        .set({ status: 'canceled', updated_at: ts })
        .where('batch_id', '=', id)
        .where('status', '=', 'pending')
        .execute();
      return toBatch(row);
    });
  }

  async claimNextRow(
    now: Date,
    staleBefore: Date,
    throttle: ClaimThrottle,
  ): Promise<BulkRowRecord | null> {
    const ts = now.toISOString();
    // `returning *` has the same keys as the table.
    const result = await sql<Selectable<BulkBatchRowsTable>>`
      update public.bulk_batch_rows
      set status = 'processing',
          locked_at = ${ts},
          attempts = attempts + 1,
          updated_at = ${ts}
      where id = (
        select r.id
          from public.bulk_batch_rows r
          join public.bulk_batches b on b.id = r.batch_id
         where b.status = 'processing'
           and (r.status = 'pending'
                or (r.status = 'processing' and r.locked_at < ${staleBefore.toISOString()}))
           and (select count(*) from public.bulk_batch_rows t
                 where t.locked_at > ${throttle.windowStart.toISOString()}) < ${throttle.maxPerWindow}
         order by b.confirmed_at asc, r.row_index asc
         for update of r skip locked
         limit 1
      )
      returning *
    `.execute(this.db);
    const row = result.rows[0];
    return row ? toRow(row) : null;
  }

  async setRowEnvelope(row_id: string, envelope_id: string): Promise<void> {
    await this.db
      .updateTable('bulk_batch_rows')
      .set({ envelope_id, updated_at: new Date().toISOString() })
      .where('id', '=', row_id)
      .execute();
  }

  async markRowSent(row_id: string, now: Date): Promise<void> {
    await this.db
      .updateTable('bulk_batch_rows')
      .set({
        status: 'sent',
        sent_at: now.toISOString(),
        error_code: null,
        updated_at: now.toISOString(),
      })
      .where('id', '=', row_id)
      .execute();
  }

  async markRowFailed(row_id: string, error_code: string): Promise<void> {
    await this.db
      .updateTable('bulk_batch_rows')
      .set({ status: 'failed', error_code, updated_at: new Date().toISOString() })
      .where('id', '=', row_id)
      .execute();
  }

  async releaseRow(row_id: string, error_code: string): Promise<void> {
    await this.db
      .updateTable('bulk_batch_rows')
      .set({ status: 'pending', error_code, updated_at: new Date().toISOString() })
      .where('id', '=', row_id)
      .where('status', '=', 'processing')
      .execute();
  }

  async finishIfDone(batch_id: string, now: Date): Promise<boolean> {
    const res = await sql<{ id: string }>`
      update public.bulk_batches b
         set status = case when b.status = 'processing' then 'completed' else b.status end,
             completed_at = ${now.toISOString()}
       where b.id = ${batch_id}
         and b.completed_at is null
         and b.status in ('processing', 'canceled')
         and not exists (
           select 1 from public.bulk_batch_rows r
            where r.batch_id = b.id and r.status in ('pending', 'processing'))
      returning b.id
    `.execute(this.db);
    return res.rows.length > 0;
  }

  async listFinishedWithoutSummary(limit: number): Promise<ReadonlyArray<BulkBatchRecord>> {
    const rows = await this.db
      .selectFrom('bulk_batches')
      .selectAll()
      .where('notified_at', 'is', null)
      .where('completed_at', 'is not', null)
      .where('status', 'in', ['completed', 'canceled'])
      .orderBy('completed_at', 'asc')
      .limit(limit)
      .execute();
    return rows.map(toBatch);
  }

  async markNotified(batch_id: string, now: Date): Promise<void> {
    await this.db
      .updateTable('bulk_batches')
      .set({ notified_at: now.toISOString() })
      .where('id', '=', batch_id)
      .where('notified_at', 'is', null)
      .execute();
  }
}
