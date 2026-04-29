/**
 * Templates — shared domain types between the API and the SPA.
 *
 * A template captures a saved field layout (signature/initial/date/text/
 * checkbox positions, addressed by a `pageRule` like `'all' | 'first' |
 * 'last' | <page-num>`) so the sender can apply it to a new PDF and have
 * the same fields snap onto every signing flow that reuses this layout.
 *
 * The HTTP contract uses these types directly. The DB schema in
 * `apps/api/db/schema.ts` mirrors the `TemplateField` shape inside the
 * `field_layout` jsonb column.
 */

export const TEMPLATE_FIELD_TYPES = [
  'signature',
  'initial',
  'date',
  'text',
  'checkbox',
] as const;
export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];

/**
 * Where a saved field lands when the template is applied to a target document.
 *
 *   `'all'`        — every page in the target.
 *   `'allButLast'` — every page except the final one (initials on body pages).
 *   `'first'`      — first page only.
 *   `'last'`       — last page only.
 *   `<page-num>`   — exact 1-indexed page; ignored if the target is shorter.
 */
export type TemplatePageRule =
  | 'all'
  | 'allButLast'
  | 'first'
  | 'last'
  | number;

export interface TemplateField {
  readonly type: TemplateFieldType;
  readonly pageRule: TemplatePageRule;
  /** PDF point coordinate, top-left origin. */
  readonly x: number;
  readonly y: number;
  readonly label?: string;
}

/**
 * Full template record as returned by the API. ISO timestamps; `null` for
 * a never-used template (`uses_count` is 0 and `last_used_at` is `null`).
 */
export interface Template {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly cover_color: string | null;
  readonly field_layout: ReadonlyArray<TemplateField>;
  readonly uses_count: number;
  readonly last_used_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateTemplateInput {
  readonly title: string;
  readonly description?: string | null;
  readonly cover_color?: string | null;
  readonly field_layout: ReadonlyArray<TemplateField>;
}

export interface UpdateTemplateInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly cover_color?: string | null;
  readonly field_layout?: ReadonlyArray<TemplateField>;
}
