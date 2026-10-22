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
  /**
   * Zero-based index into the signer roster active when the template was
   * saved. Kept for legacy templates predating `signerRoleId`; new saves
   * populate both fields, and consumers prefer `signerRoleId` when
   * present so that mid-list signer removals don't cause kept signers'
   * placements to shift up.
   */
  readonly signerIndex?: number;
  /**
   * Stable per-signer id from the roster active when the template was
   * saved — matches `TemplateLastSigner.id`. Resolves the wizard bug
   * where removing a prefilled signer in the use-template flow caused
   * remaining signers' placements to inherit the removed signer's
   * position (an artifact of the old ordinal-only binding compressing
   * indexes). Optional: legacy templates without this field fall back
   * to `signerIndex`, and consumers backfill it at resolve time using
   * `last_signers` so even unsaved legacy templates pick up the new
   * behavior.
   */
  readonly signerRoleId?: string;
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

/**
 * One concrete field produced by applying a template layout to a document
 * of a known page count.
 */
export interface ResolvedTemplateField {
  readonly id: string;
  readonly page: number;
  readonly type: TemplateFieldType;
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  /** Mirrors `TemplateField.signerIndex` (legacy binder). */
  readonly signerIndex?: number;
  /**
   * Mirrors `TemplateField.signerRoleId`; backfilled from
   * `lastSigners[signerIndex].id` when the stored record only has an
   * ordinal, so legacy templates pick up the stable-id binding.
   */
  readonly signerRoleId?: string;
  /**
   * Shared by every copy expanded from one multi-page rule (`'all'`,
   * `'allButLast'`). Lets the editor ask "delete from all pages or just
   * this one?". Undefined for single-page rules.
   */
  readonly linkId?: string;
}

/**
 * Expand a template's saved field layout onto a target document with
 * `totalPages` pages. Pure and deterministic: ids are `tpl-f1…`, link ids
 * `tpl-link-1…`. Pages outside the target (numeric rule beyond the end)
 * are dropped. Used by both the API (`TemplateApplyService`) and the SPA
 * offline fallback so the two cannot drift.
 */
export function expandTemplateFields(
  fields: ReadonlyArray<TemplateField>,
  totalPages: number,
  lastSigners?: ReadonlyArray<{ readonly id: string }>,
): ReadonlyArray<ResolvedTemplateField> {
  const out: ResolvedTemplateField[] = [];
  let id = 1;
  let linkSeq = 1;
  for (const tf of fields) {
    let pages: number[] = [];
    if (tf.pageRule === 'all') {
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else if (tf.pageRule === 'allButLast') {
      pages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 1);
    } else if (tf.pageRule === 'last') {
      pages = totalPages > 0 ? [totalPages] : [];
    } else if (tf.pageRule === 'first') {
      pages = totalPages > 0 ? [1] : [];
    } else if (typeof tf.pageRule === 'number') {
      pages = tf.pageRule >= 1 && tf.pageRule <= totalPages ? [tf.pageRule] : [];
    }
    // Only multi-page expansions get a linkId.
    const linkId = pages.length > 1 ? `tpl-link-${linkSeq++}` : undefined;
    let signerRoleId: string | undefined = tf.signerRoleId;
    if (signerRoleId === undefined && tf.signerIndex !== undefined && lastSigners) {
      signerRoleId = lastSigners[tf.signerIndex]?.id;
    }
    for (const p of pages) {
      out.push({
        id: `tpl-f${id++}`,
        page: p,
        type: tf.type,
        x: tf.x,
        y: tf.y,
        ...(tf.label !== undefined ? { label: tf.label } : {}),
        ...(tf.signerIndex !== undefined ? { signerIndex: tf.signerIndex } : {}),
        ...(signerRoleId !== undefined ? { signerRoleId } : {}),
        ...(linkId !== undefined ? { linkId } : {}),
      });
    }
  }
  return out;
}
