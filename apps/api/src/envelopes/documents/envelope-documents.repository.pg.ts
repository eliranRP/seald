import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable, Transaction } from 'kysely';
import type { Database, EnvelopeDocumentsTable } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import {
  DocumentEnvelopeNotDraftError,
  EnvelopeDocumentsRepository,
  TooManyDocumentsError,
  type EnvelopeDocumentRecord,
  type InsertDocumentInput,
} from './envelope-documents.repository';

type DocumentRow = Selectable<EnvelopeDocumentsTable>;

/**
 * `ord` is renumbered in two steps (shift out of range, then assign) because
 * `unique (envelope_id, ord)` is not deferrable and Postgres checks it row
 * by row inside one UPDATE.
 */
const ORD_SHIFT = 100_000;

const COLUMNS = [
  'id',
  'envelope_id',
  'ord',
  'title',
  'original_file_path',
  'original_sha256',
  'original_pages',
  'sealed_file_path',
  'sealed_sha256',
] as const;

function toRecord(row: Pick<DocumentRow, (typeof COLUMNS)[number]>): EnvelopeDocumentRecord {
  return {
    id: row.id,
    envelope_id: row.envelope_id,
    ord: row.ord,
    title: row.title,
    original_file_path: row.original_file_path,
    original_sha256: row.original_sha256,
    original_pages: row.original_pages,
    sealed_file_path: row.sealed_file_path,
    sealed_sha256: row.sealed_sha256,
  };
}

@Injectable()
export class EnvelopeDocumentsPgRepository extends EnvelopeDocumentsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async listByEnvelope(envelope_id: string): Promise<ReadonlyArray<EnvelopeDocumentRecord>> {
    const rows = await this.db
      .selectFrom('envelope_documents')
      .select(COLUMNS)
      .where('envelope_id', '=', envelope_id)
      .orderBy('ord', 'asc')
      .execute();
    return rows.map(toRecord);
  }

  async insertDocument(input: InsertDocumentInput): Promise<EnvelopeDocumentRecord> {
    return this.db.transaction().execute(async (trx) => {
      await this.lockDraft(trx, input.envelope_id);
      const stats = await trx
        .selectFrom('envelope_documents')
        .select((eb) => [eb.fn.countAll<string>().as('n'), eb.fn.max('ord').as('max_ord')])
        .where('envelope_id', '=', input.envelope_id)
        .executeTakeFirstOrThrow();
      const count = Number(stats.n);
      if (count >= input.max_documents) throw new TooManyDocumentsError();
      const ord = (stats.max_ord === null ? 0 : Number(stats.max_ord)) + 1;
      const row = await trx
        .insertInto('envelope_documents')
        .values({
          id: input.id,
          envelope_id: input.envelope_id,
          ord,
          title: input.title,
          original_file_path: input.original_file_path,
          original_sha256: input.original_sha256,
          original_pages: input.original_pages,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      if (ord === 1) await this.mirrorPrimary(trx, input.envelope_id);
      return toRecord(row);
    });
  }

  async setTitle(envelope_id: string, document_id: string, title: string): Promise<boolean> {
    const res = await this.db
      .updateTable('envelope_documents')
      .set({ title })
      .where('envelope_id', '=', envelope_id)
      .where('id', '=', document_id)
      .executeTakeFirst();
    return (res.numUpdatedRows ?? 0n) > 0n;
  }

  async removeDocument(
    envelope_id: string,
    document_id: string,
  ): Promise<EnvelopeDocumentRecord | null> {
    return this.db.transaction().execute(async (trx) => {
      await this.lockDraft(trx, envelope_id);
      const removed = await trx
        .deleteFrom('envelope_documents')
        .where('envelope_id', '=', envelope_id)
        .where('id', '=', document_id)
        .returning(COLUMNS)
        .executeTakeFirst();
      if (!removed) return null;
      const rest = await trx
        .selectFrom('envelope_documents')
        .select(['id'])
        .where('envelope_id', '=', envelope_id)
        .orderBy('ord', 'asc')
        .execute();
      await this.assignOrder(
        trx,
        envelope_id,
        rest.map((r) => r.id),
      );
      if (removed.ord === 1) await this.mirrorPrimary(trx, envelope_id);
      return toRecord(removed);
    });
  }

  async reorder(
    envelope_id: string,
    document_ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<EnvelopeDocumentRecord>> {
    return this.db.transaction().execute(async (trx) => {
      await this.lockDraft(trx, envelope_id);
      await this.assignOrder(trx, envelope_id, document_ids);
      await this.mirrorPrimary(trx, envelope_id);
      const rows = await trx
        .selectFrom('envelope_documents')
        .select(COLUMNS)
        .where('envelope_id', '=', envelope_id)
        .orderBy('ord', 'asc')
        .execute();
      return rows.map(toRecord);
    });
  }

  async listFieldDocumentIds(envelope_id: string): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db
      .selectFrom('envelope_fields')
      .select(['id', 'document_id'])
      .where('envelope_id', '=', envelope_id)
      .execute();
    return new Map(rows.map((r) => [r.id, r.document_id]));
  }

  async setSealed(
    document_id: string,
    sealed_file_path: string,
    sealed_sha256: string,
  ): Promise<void> {
    await this.db
      .updateTable('envelope_documents')
      .set({ sealed_file_path, sealed_sha256 })
      .where('id', '=', document_id)
      .execute();
  }

  /** `select … for update` on a draft envelope; throws when it is not one. */
  private async lockDraft(trx: Transaction<Database>, envelope_id: string): Promise<void> {
    const env = await trx
      .selectFrom('envelopes')
      .select(['status'])
      .where('id', '=', envelope_id)
      .forUpdate()
      .executeTakeFirst();
    if (!env || env.status !== 'draft') throw new DocumentEnvelopeNotDraftError();
  }

  /** Dense 1-based `ord` in the order given. */
  private async assignOrder(
    trx: Transaction<Database>,
    envelope_id: string,
    document_ids: ReadonlyArray<string>,
  ): Promise<void> {
    if (document_ids.length === 0) return;
    await trx
      .updateTable('envelope_documents')
      .set((eb) => ({ ord: eb('ord', '+', ORD_SHIFT) }))
      .where('envelope_id', '=', envelope_id)
      .execute();
    for (const [index, id] of document_ids.entries()) {
      await trx
        .updateTable('envelope_documents')
        .set({ ord: index + 1 })
        .where('envelope_id', '=', envelope_id)
        .where('id', '=', id)
        .execute();
    }
  }

  /**
   * Point the legacy envelope columns at the current document 1, so they
   * keep mirroring it after slot 1 changed hands. The 0022 mirror trigger
   * then sees values equal to document 1 and writes nothing back.
   */
  private async mirrorPrimary(trx: Transaction<Database>, envelope_id: string): Promise<void> {
    const first = await trx
      .selectFrom('envelope_documents')
      .select(['original_file_path', 'original_sha256', 'original_pages'])
      .where('envelope_id', '=', envelope_id)
      .where('ord', '=', 1)
      .executeTakeFirst();
    if (!first) return;
    await trx
      .updateTable('envelopes')
      .set({
        original_file_path: first.original_file_path,
        original_sha256: first.original_sha256,
        original_pages: first.original_pages,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', envelope_id)
      .execute();
  }
}
