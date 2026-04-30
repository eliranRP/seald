import type { Template, TemplateField, TemplateLastSigner } from 'shared';

export interface CreateTemplateInput {
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly cover_color: string | null;
  readonly field_layout: ReadonlyArray<TemplateField>;
  /**
   * Tags + last_signers are optional on the repo input — both default
   * to `[]` when the caller omits them. The service-layer wrapper
   * always passes through (with sensible defaults) so the wire
   * shape is consistent; tests can omit them for terseness.
   */
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<TemplateLastSigner>;
}

export interface UpdateTemplatePatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly cover_color?: string | null;
  readonly field_layout?: ReadonlyArray<TemplateField>;
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<TemplateLastSigner>;
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
