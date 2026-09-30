/**
 * Convert the editor's `PlacedFieldValue[]` into the API's `TemplateField[]`
 * shape, collapsing linked copies into a single entry with a derived
 * `pageRule` so the saved template can re-project onto a different PDF.
 *
 * Why this lives in the templates feature: the editor produces one record
 * per PDF page (a "linked copy" set is N records that share `linkId`).
 * Templates instead store ONE record per logical field with a rule like
 * `'all'` / `'allButLast'` / `'first'` / `'last'` / `<page>`. The
 * mapping is purely client-side until/unless we move template authoring
 * into the API. Decoupling it from the editor lets us unit-test the
 * pageRule inference and surface a clear failure mode (a divergent
 * linked group ⇒ fall back to per-page numeric entries).
 *
 * Inference rules, in order:
 *   1. Single-page field           → `pageRule: <page>` (numeric).
 *   2. Linked group covering ALL pages of the document → `'all'`.
 *   3. Linked group covering pages 1..N-1 (totalPages ≥ 2) → `'allButLast'`.
 *   4. Linked group covering only page 1               → `'first'`.
 *   5. Linked group covering only the last page        → `'last'`.
 *   6. Anything else (custom subset, gaps)             → fan out as N
 *      individual numeric entries (one per page) so the layout is still
 *      reproducible byte-for-byte; we just lose the rule label.
 *
 * Linked copies *should* share (x,y) because the editor placed them
 * from a single source field, but the user can drag any copy
 * independently afterwards. We use the first copy's (x,y) as the
 * canonical position and trust the editor's UI to keep them in sync.
 * (If divergent positions become a real problem, callers can detect it
 * and fall back to per-page entries — but the editor's "Move all linked"
 * affordance prevents this in practice.)
 */

import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { FieldKind } from '@/types/sealdTypes';
import {
  toTemplateCoordV2,
  type TemplateField,
  type TemplateFieldType,
  type TemplatePageRule,
} from 'shared';

// `FieldKind` (editor canon: 'initials') vs `TemplateFieldType` (template
// canon: 'initial'). The same singular/plural reconciliation as
// UploadRoute, mirrored here so the round-trip is symmetric.
const FIELD_KIND_TO_TEMPLATE: Partial<Record<FieldKind, TemplateFieldType>> = {
  signature: 'signature',
  initials: 'initial',
  date: 'date',
  text: 'text',
  checkbox: 'checkbox',
  email: 'email',
};

/** Displayed page size used to turn editor pixels into `coordVersion` 2. */
export interface TemplateDerivePageSize {
  readonly page: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Pure inference helper exported separately so unit tests can hit every
 * branch without building synthetic `PlacedFieldValue`s. Pages MUST be
 * sorted ascending and unique.
 */
export function inferPageRule(
  pages: ReadonlyArray<number>,
  totalPages: number,
): TemplatePageRule | null {
  if (pages.length === 0) return null;
  if (pages.length === 1) {
    const only = pages[0];
    if (only === undefined) return null;
    if (totalPages > 0 && only === totalPages) return 'last';
    if (only === 1) return 'first';
    return only;
  }
  // For multi-page groups: only collapse when the coverage matches a
  // named rule exactly. Anything in between (e.g. {1, 3} on a 5-page
  // doc) returns null so the caller fans out per-page numeric entries.
  if (totalPages > 0 && pages.length === totalPages) {
    return pages.every((p, i) => p === i + 1) ? 'all' : null;
  }
  if (totalPages >= 2 && pages.length === totalPages - 1) {
    return pages.every((p, i) => p === i + 1) ? 'allButLast' : null;
  }
  return null;
}

/**
 * Minimal signer shape we need to compute the `signerIndex` for each
 * saved field. Callers typically pass the editor's `draft.signers`.
 */
interface DerivedFieldLayoutSigner {
  readonly id: string;
}

/**
 * Build the API-bound `field_layout` array from the editor's current
 * placed fields. `totalPages` MUST be the page count of the document
 * the user authored against — it's how we name `'all'` vs `'allButLast'`.
 *
 * `signers` is optional. When provided, each saved entry records a
 * `signerIndex` (0-based ordinal into the supplied roster) so reuse
 * can rebind every field to its original signer instead of collapsing
 * them onto the first signer. When omitted, the layout is back-compat
 * (no `signerIndex`) and consumers fall back to signers[0].
 *
 * Coordinates are written as `coordVersion` 2 (0–1 of the displayed
 * page). `pageSizes` supplies the aspect: the field's page, else the
 * first known page, else a 560×740 grid. Width and height use the
 * shared per-kind pixel defaults when the editor has not resized.
 */
export function deriveTemplateFieldLayout(
  fields: ReadonlyArray<PlacedFieldValue>,
  totalPages: number,
  signers?: ReadonlyArray<DerivedFieldLayoutSigner>,
  pageSizes?: ReadonlyArray<TemplateDerivePageSize>,
): ReadonlyArray<TemplateField> {
  if (fields.length === 0) return [];

  const signerOrdinalById = new Map<string, number>();
  if (signers) {
    signers.forEach((s, i) => signerOrdinalById.set(s.id, i));
  }

  // Bucket by linkId. Standalone fields (no linkId) go into singleton
  // buckets so the per-page fallback below still works for them.
  const groups = new Map<string, PlacedFieldValue[]>();
  for (const f of fields) {
    const key = f.linkId ?? `__solo:${f.id}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(f);
    groups.set(key, bucket);
  }

  const out: TemplateField[] = [];
  for (const bucket of groups.values()) {
    const sorted = [...bucket].sort((a, b) => a.page - b.page);
    const pages = Array.from(new Set(sorted.map((f) => f.page))).sort((a, b) => a - b);
    const head = sorted[0];
    if (head === undefined) continue;
    const templateType = FIELD_KIND_TO_TEMPLATE[head.type];
    if (!templateType) {
      continue;
    }
    const pageSize = pageSizes?.find((size) => size.page === head.page) ?? pageSizes?.[0];
    const box = toTemplateCoordV2(
      {
        type: templateType,
        x: head.x,
        y: head.y,
        ...(head.width !== undefined ? { width: head.width } : {}),
        ...(head.height !== undefined ? { height: head.height } : {}),
      },
      pageSize,
    );
    // Derive signerIndex AND signerRoleId from the head field's first
    // assigned signer. Linked copies share an assignment in the editor
    // today (the group toolbar applies the picker to every member), so
    // the head's signerIds[0] is representative of the bucket. Both
    // fields are populated when `signers` is supplied — the ordinal
    // for legacy back-compat, the role-id as the canonical binder.
    let signerIndex: number | undefined;
    let signerRoleId: string | undefined;
    if (signers) {
      const headSignerId = head.signerIds[0];
      if (headSignerId !== undefined) {
        const idx = signerOrdinalById.get(headSignerId);
        if (idx !== undefined) {
          signerIndex = idx;
          signerRoleId = headSignerId;
        }
      }
    }
    const rule = inferPageRule(pages, totalPages);
    if (rule !== null) {
      out.push({
        type: templateType,
        pageRule: rule,
        ...box,
        ...(head.linkId ? { label: head.linkId } : {}),
        ...(signerIndex !== undefined ? { signerIndex } : {}),
        ...(signerRoleId !== undefined ? { signerRoleId } : {}),
      });
      continue;
    }
    // Custom coverage — fan out one numeric entry per page so the
    // shape is preserved exactly. (We deliberately don't bake the
    // arbitrary subset into `pageRule`; the API only knows the four
    // named rules + numeric.)
    for (const page of pages) {
      out.push({
        type: templateType,
        pageRule: page,
        ...box,
        ...(head.linkId ? { label: head.linkId } : {}),
        ...(signerIndex !== undefined ? { signerIndex } : {}),
        ...(signerRoleId !== undefined ? { signerRoleId } : {}),
      });
    }
  }
  return out;
}
