import type { Template, TemplateField } from 'shared';

export interface CreateTemplateInput {
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly cover_color: string | null;
  readonly field_layout: ReadonlyArray<TemplateField>;
}

export interface UpdateTemplatePatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly cover_color?: string | null;
  readonly field_layout?: ReadonlyArray<TemplateField>;
}

/**
 * Port for template persistence. Every method takes `owner_id` as an
 * explicit argument so the scoping rule is visible at every call site.
 * The repository does not know about "the current user" — the caller
 * (controller / service) enforces that.
 */
export abstract class TemplatesRepository {
  abstract create(input: CreateTemplateInput): Promise<Template>;
  abstract findAllByOwner(owner_id: string): Promise<ReadonlyArray<Template>>;
  abstract findOneByOwner(owner_id: string, id: string): Promise<Template | null>;
  abstract update(
    owner_id: string,
    id: string,
    patch: UpdateTemplatePatch,
  ): Promise<Template | null>;
  abstract delete(owner_id: string, id: string): Promise<boolean>;
  /**
   * Bump `uses_count` and set `last_used_at = now()` for the given
   * template. Returns null if the template doesn't exist or isn't owned
   * by `owner_id`. Callers wire this from the upload-flow integration:
   * when a sender clicks "Continue with this template", the upload flow
   * POSTs `/templates/:id/use` to record the usage.
   */
  abstract incrementUseCount(owner_id: string, id: string): Promise<Template | null>;
}
