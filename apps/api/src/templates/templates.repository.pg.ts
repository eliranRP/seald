import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Template, TemplateField, TemplateLastSigner } from 'shared';
import type { Database, TemplatesTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  TemplatesRepository,
  type CreateTemplateInput,
  type UpdateTemplatePatch,
} from './templates.repository';

type Row = Selectable<TemplatesTable>;

function toDomain(r: Row): Template {
  return {
    id: r.id,
    owner_id: r.owner_id,
    title: r.title,
    description: r.description,
    cover_color: r.cover_color,
    field_layout: r.field_layout as ReadonlyArray<TemplateField>,
    tags: (r.tags ?? []) as ReadonlyArray<string>,
    last_signers: (r.last_signers ?? []) as ReadonlyArray<TemplateLastSigner>,
    // The storage path itself is internal — surface only a boolean so
    // clients can decide whether to fetch the PDF without learning the
    // bucket layout.
    has_example_pdf: r.example_pdf_path !== null && r.example_pdf_path !== undefined,
    uses_count: r.uses_count,
    last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

@Injectable()
export class TemplatesPgRepository extends TemplatesRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async create(input: CreateTemplateInput): Promise<Template> {
    const row = await this.db
      .insertInto('templates')
      .values({
        owner_id: input.owner_id,
        title: input.title,
        description: input.description,
        cover_color: input.cover_color,
        field_layout: JSON.stringify(input.field_layout),
        tags: JSON.stringify(input.tags ?? []),
        last_signers: JSON.stringify(input.last_signers ?? []),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Template>> {
    const rows = await this.db
      .selectFrom('templates')
      .selectAll()
      .where('owner_id', '=', owner_id)
      // Recently-used first; never-used (last_used_at IS NULL) at the bottom.
      .orderBy(sql`last_used_at desc nulls last`)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Template | null> {
    const row = await this.db
      .selectFrom('templates')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async update(owner_id: string, id: string, patch: UpdateTemplatePatch): Promise<Template | null> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.cover_color !== undefined) update['cover_color'] = patch.cover_color;
    if (patch.field_layout !== undefined) {
      update['field_layout'] = JSON.stringify(patch.field_layout);
    }
    if (patch.tags !== undefined) {
      update['tags'] = JSON.stringify(patch.tags);
    }
    if (patch.last_signers !== undefined) {
      update['last_signers'] = JSON.stringify(patch.last_signers);
    }
    if (Object.keys(update).length === 1) {
      // Only updated_at — caller passed an empty patch. Return current.
      return this.findOneByOwner(owner_id, id);
    }
    const row = await this.db
      .updateTable('templates')
      .set(update)
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('templates')
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return (res?.numDeletedRows ?? 0n) > 0n;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    const res = await this.db
      .deleteFrom('templates')
      .where('owner_id', '=', owner_id)
      .executeTakeFirst();
    return Number(res?.numDeletedRows ?? 0n);
  }

  async incrementUseCount(owner_id: string, id: string): Promise<Template | null> {
    const now = new Date().toISOString();
    const row = await this.db
      .updateTable('templates')
      .set({
        uses_count: sql`uses_count + 1` as never,
        last_used_at: now,
        updated_at: now,
      })
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async setExamplePdfPath(
    owner_id: string,
    id: string,
    path: string | null,
  ): Promise<Template | null> {
    const row = await this.db
      .updateTable('templates')
      .set({
        example_pdf_path: path,
        updated_at: new Date().toISOString(),
      })
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async getExamplePdfPath(owner_id: string, id: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('templates')
      .select('example_pdf_path')
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return row?.example_pdf_path ?? null;
  }
}
