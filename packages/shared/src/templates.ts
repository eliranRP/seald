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
 * One previously-attached signer captured on the latest "Send and
 * update template" event. Persisted alongside the template so the
 * next sender starts with the same roster pre-filled. Stored verbatim
 * — `id` is the contact id, or a synthesized guest id when the signer
 * was an ad-hoc email entry.
 */
export interface TemplateLastSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
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
  /** Client-side tags for filter / group on the templates list. */
  readonly tags: ReadonlyArray<string>;
  /**
   * Last signer roster used when this template was sent. Empty until
   * the first "Send and update template" persists it.
   */
  readonly last_signers: ReadonlyArray<TemplateLastSigner>;
  /**
   * `true` when an example PDF has been uploaded for this template
   * (via `POST /templates/:id/example`). The SPA uses this to decide
   * whether to fetch the saved PDF on the use-template flow vs. fall
   * back to its local placeholder canvas. The actual storage path is
   * server-side only; clients always go through
   * `GET /templates/:id/example` to retrieve the bytes.
   */
  readonly has_example_pdf: boolean;
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
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<TemplateLastSigner>;
}

export interface UpdateTemplateInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly cover_color?: string | null;
  readonly field_layout?: ReadonlyArray<TemplateField>;
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<TemplateLastSigner>;
}
