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

  reset(): void {
    this.rows.clear();
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
      .filter((t) => t.owner_id === owner_id)
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
    const t = this.rows.get(id);
    return t && t.owner_id === owner_id ? t : null;
  }

  async update(owner_id: string, id: string, patch: UpdateTemplatePatch): Promise<Template | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return null;
    const next: Template = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return false;
    this.rows.delete(id);
    return true;
  }

  async incrementUseCount(owner_id: string, id: string): Promise<Template | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return null;
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
}
