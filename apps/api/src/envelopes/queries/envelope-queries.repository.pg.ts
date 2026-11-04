import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { EnvelopeStatus } from 'shared';
import type { Database } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import {
  EnvelopeQueriesRepository,
  type PendingCursor,
  type PendingPage,
  type SearchDocumentRow,
  type SearchFilters,
  type SearchPage,
  type SearchSignerRow,
} from './envelope-queries.repository';

/** `updated_at` as exact UTC text, so the keyset never loses microseconds. */
const CURSOR_TS = sql<string>`to_char(e.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Escape LIKE wildcards in a needle; the pattern uses `escape '\'`. */
export function likeContains(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function toIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

interface EnvelopeRow {
  id: string;
  title: string;
  status: EnvelopeStatus;
  short_code: string;
  sent_at: Date | null;
  updated_at: Date;
  archived_at: Date | null;
  cursor_updated_at: string;
}

interface SignerRow {
  id: string;
  envelope_id: string;
  name: string;
  email: string;
  viewed_at: Date | null;
  signed_at: Date | null;
  declined_at: Date | null;
  access_token_sent_at: Date | null;
}

interface DocumentRow {
  id: string;
  envelope_id: string;
  ord: number;
  title: string;
  original_pages: number | null;
}

interface PendingRow {
  envelope_id: string;
  title: string;
  envelope_status: EnvelopeStatus;
  signer_id: string;
  name: string;
  email: string;
  sent_at: Date | null;
  viewed_at: Date | null;
  cursor_updated_at: string;
}

/**
 * Postgres adapter for EnvelopeQueriesRepository. Every predicate is a
 * bound parameter. The owner bound comes first so
 * `envelopes_owner_status_updated_idx (owner_id, status, updated_at desc)`
 * serves the scan; title, signer and tag filters stay residual predicates
 * (no new index, per the design doc).
 */
@Injectable()
export class EnvelopeQueriesPgRepository extends EnvelopeQueriesRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async search(owner_id: string, f: SearchFilters): Promise<SearchPage> {
    const where: RawBuilder<unknown>[] = [sql`e.owner_id = ${owner_id}`];
    if (f.statuses && f.statuses.length > 0) {
      where.push(sql`e.status::text = any(${[...f.statuses]}::text[])`);
    }
    if (f.title !== undefined) {
      const pattern = likeContains(f.title);
      where.push(
        sql`(lower(e.title) like ${pattern} escape '\\' or lower(e.short_code) like ${pattern} escape '\\')`,
      );
    }
    if (f.tags && f.tags.length > 0) {
      const clauses = f.tags.map((t) => sql`e.tags @> ${JSON.stringify([t])}::jsonb`);
      where.push(sql`(${sql.join(clauses, sql` or `)})`);
    }
    if (f.date_from !== undefined) where.push(sql`e.updated_at >= ${f.date_from}::timestamptz`);
    if (f.date_to !== undefined) where.push(sql`e.updated_at < ${f.date_to}::timestamptz`);
    if (f.template_id !== undefined) {
      // Migration 0031 column; not in db/schema.ts yet, so referenced raw.
      where.push(sql`e.source_template_id = ${f.template_id}::uuid`);
    }
    if (f.drive_file_name !== undefined) {
      const pattern = likeContains(f.drive_file_name);
      where.push(sql`exists (
        select 1 from public.envelope_documents d
         where d.envelope_id = e.id
           and lower(d.source_drive_file_name) like ${pattern} escape '\\')`);
    }
    if (f.archived !== undefined) {
      where.push(f.archived ? sql`e.archived_at is not null` : sql`e.archived_at is null`);
    }
    if (f.signer !== undefined) {
      const pattern = likeContains(f.signer);
      where.push(sql`exists (
        select 1 from public.envelope_signers s
         where s.envelope_id = e.id
           and (lower(s.name) like ${pattern} escape '\\'
                or lower(s.email::text) like ${pattern} escape '\\'))`);
    }
    if (f.cursor) {
      where.push(
        sql`(e.updated_at, e.id) < (${f.cursor.updated_at}::timestamptz, ${f.cursor.id}::uuid)`,
      );
    }

    const result = await sql<EnvelopeRow>`
      select e.id, e.title, e.status, e.short_code, e.sent_at, e.updated_at, e.archived_at,
             ${CURSOR_TS} as cursor_updated_at
        from public.envelopes e
       where ${sql.join(where, sql` and `)}
       order by e.updated_at desc, e.id desc
       limit ${f.limit + 1}`.execute(this.db);

    const has_more = result.rows.length > f.limit;
    const page = result.rows.slice(0, f.limit);
    if (page.length === 0) return { rows: [], has_more: false };

    const ids = page.map((r) => r.id);
    const [signers, documents] = await Promise.all([
      sql<SignerRow>`
        select s.id, s.envelope_id, s.name, s.email::text as email, s.viewed_at,
               s.signed_at, s.declined_at, s.access_token_sent_at
          from public.envelope_signers s
         where s.envelope_id = any(${ids}::uuid[])
         order by s.signing_order asc, s.created_at asc, s.id asc`.execute(this.db),
      sql<DocumentRow>`
        select d.id, d.envelope_id, d.ord, d.title, d.original_pages
          from public.envelope_documents d
         where d.envelope_id = any(${ids}::uuid[])
         order by d.ord asc`.execute(this.db),
    ]);
    const signersBy = groupBy(signers.rows, (s) => s.envelope_id);
    const docsBy = groupBy(documents.rows, (d) => d.envelope_id);

    return {
      has_more,
      rows: page.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        short_code: r.short_code,
        sent_at: toIso(r.sent_at),
        updated_at: new Date(r.updated_at).toISOString(),
        archived_at: toIso(r.archived_at),
        cursor_updated_at: r.cursor_updated_at,
        signers: (signersBy.get(r.id) ?? []).map((s): SearchSignerRow => ({
          id: s.id,
          name: s.name,
          email: s.email,
          viewed_at: toIso(s.viewed_at),
          signed_at: toIso(s.signed_at),
          declined_at: toIso(s.declined_at),
          access_token_sent_at: toIso(s.access_token_sent_at),
        })),
        documents: (docsBy.get(r.id) ?? []).map((d): SearchDocumentRow => ({
          id: d.id,
          ord: d.ord,
          title: d.title,
          original_pages: d.original_pages,
        })),
      })),
    };
  }

  async listPendingSigners(
    owner_id: string,
    opts: { readonly limit: number; readonly cursor: PendingCursor | null },
  ): Promise<PendingPage> {
    const after = opts.cursor
      ? sql`and (e.updated_at, e.id, s.id) < (${opts.cursor.updated_at}::timestamptz, ${opts.cursor.id}::uuid, ${opts.cursor.signer_id}::uuid)`
      : sql``;
    const result = await sql<PendingRow>`
      select e.id as envelope_id, e.title, e.status as envelope_status,
             s.id as signer_id, s.name, s.email::text as email,
             coalesce(s.access_token_sent_at, e.sent_at) as sent_at, s.viewed_at,
             ${CURSOR_TS} as cursor_updated_at
        from public.envelopes e
        join public.envelope_signers s on s.envelope_id = e.id
       where e.owner_id = ${owner_id}
         and e.status = 'awaiting_others'
         and s.signed_at is null
         and s.declined_at is null
         ${after}
       order by e.updated_at desc, e.id desc, s.id desc
       limit ${opts.limit + 1}`.execute(this.db);

    const has_more = result.rows.length > opts.limit;
    return {
      has_more,
      rows: result.rows.slice(0, opts.limit).map((r) => ({
        envelope_id: r.envelope_id,
        title: r.title,
        envelope_status: r.envelope_status,
        signer_id: r.signer_id,
        name: r.name,
        email: r.email,
        sent_at: toIso(r.sent_at),
        viewed_at: toIso(r.viewed_at),
        cursor_updated_at: r.cursor_updated_at,
      })),
    };
  }
}

function groupBy<T>(rows: ReadonlyArray<T>, key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
