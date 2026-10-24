import { randomUUID } from 'node:crypto';
import type { Template } from 'shared';
import {
  TemplatesRepository,
  type CreateTemplateInput,
  type UpdateTemplatePatch,
} from '../src/templates/templates.repository';

/**
 * In-memory repo used by controller e2e. Mirrors the real adapter's
 * contract — no DB dependency keeps the e2e fast and hermetic.
 */
export class InMemoryTemplatesRepository extends TemplatesRepository {
  private readonly rows = new Map<string, Template>();
  // Stores the example-PDF storage path keyed by template id, parallel
  // to the `example_pdf_path` column the PG adapter persists. Kept
  // out-of-band so the public `Template` shape only carries the
  // boolean `has_example_pdf` flag the wire contract exposes.
  private readonly examplePaths = new Map<string, string | null>();
  /** ids of soft-deleted rows (kept in `rows` so Undo can bring them back). */
  private readonly deleted = new Set<string>();

  reset(): void {
    this.rows.clear();
    this.examplePaths.clear();
    this.deleted.clear();
  }

  private live(owner_id: string, id: string): Template | null {
    const t = this.rows.get(id);
    return t && t.owner_id === owner_id && !this.deleted.has(id) ? t : null;
  }

  async create(input: CreateTemplateInput): Promise<Template> {
    const now = new Date().toISOString();
    const t: Template = {
      id: randomUUID(),
      owner_id: input.owner_id,
      title: input.title,
      description: input.description,
      cover_color: input.cover_color,
      field_layout: input.field_layout,
      tags: input.tags ?? [],
      last_signers: input.last_signers ?? [],
      ...(input.delivery_mode !== undefined ? { delivery_mode: input.delivery_mode } : {}),
      has_example_pdf: false,
      uses_count: 0,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(t.id, t);
    return t;
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Template>> {
    return [...this.rows.values()]
      .filter((t) => t.owner_id === owner_id && !this.deleted.has(t.id))
      .sort((a, b) => {
        // last_used_at desc nulls last, then created_at desc
        if (a.last_used_at && b.last_used_at) {
          return b.last_used_at.localeCompare(a.last_used_at);
        }
        if (a.last_used_at) return -1;
        if (b.last_used_at) return 1;
        return b.created_at.localeCompare(a.created_at);
      });
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Template | null> {
    return this.live(owner_id, id);
  }

  async update(owner_id: string, id: string, patch: UpdateTemplatePatch): Promise<Template | null> {
    const existing = this.live(owner_id, id);
    if (!existing) return null;
    const next: Template = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    if (!this.live(owner_id, id)) return false;
    this.deleted.add(id);
    return true;
  }

  override async restore(owner_id: string, id: string): Promise<Template | null> {
    const t = this.rows.get(id);
    if (!t || t.owner_id !== owner_id || !this.deleted.has(id)) return null;
    this.deleted.delete(id);
    return t;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.owner_id === owner_id) {
        this.rows.delete(id);
        this.deleted.delete(id);
        this.examplePaths.delete(id);
        count++;
      }
    }
    return count;
  }

  async incrementUseCount(owner_id: string, id: string): Promise<Template | null> {
    const existing = this.live(owner_id, id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const next: Template = {
      ...existing,
      uses_count: existing.uses_count + 1,
      last_used_at: now,
      updated_at: now,
    };
    this.rows.set(id, next);
    return next;
  }

  async setExamplePdfPath(
    owner_id: string,
    id: string,
    path: string | null,
  ): Promise<Template | null> {
    const existing = this.live(owner_id, id);
    if (!existing) return null;
    this.examplePaths.set(id, path);
    const next: Template = {
      ...existing,
      has_example_pdf: path !== null,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async getExamplePdfPath(owner_id: string, id: string): Promise<string | null> {
    if (!this.live(owner_id, id)) return null;
    return this.examplePaths.get(id) ?? null;
  }
}
