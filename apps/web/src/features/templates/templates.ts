/**
 * Templates feature — types + seed data.
 *
 * Templates capture a saved field layout (initial / signature / date / text /
 * checkbox positions) on a representative document, so a sender can pick a
 * template, swap in a new PDF, and have the layout snap onto it.
 *
 * The canonical `TemplateField` / `TemplateFieldType` / `TemplatePageRule`
 * types live in `packages/shared/src/templates.ts` so the API and SPA share
 * one source of truth — re-exported here under the local
 * `TemplateFieldLayout` alias for back-compat with existing call sites.
 *
 * The seed `TEMPLATES` array stays purely client-side; the upcoming
 * backend (`feat/templates-api` PR) will replace it with a real query.
 */

import type { TemplateField, TemplateFieldType } from 'shared';

export type { TemplateFieldType, TemplatePageRule } from 'shared';
/** Local alias kept for back-compat — same shape as the shared `TemplateField`. */
export type TemplateFieldLayout = TemplateField;

export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly pages: number;
  readonly fieldCount: number;
  /** Display string like `Apr 22` — already formatted in the seed. */
  readonly lastUsed: string;
  readonly uses: number;
  /** Cover-stripe color (hex). Drives the small accent on the template card. */
  readonly cover: string;
  /** Filename of the example PDF this template was authored from. */
  readonly exampleFile: string;
  readonly fields: ReadonlyArray<TemplateFieldLayout>;
  /** Optional short description; used by search + the Save-as-template flow. */
  readonly description?: string;
  /**
   * Client-side tags for filtering / grouping in the `/templates`
   * list. Persisted on the server as a jsonb string[] column —
   * `templatesApi.toSummary` reads them off `ApiTemplate.tags`.
   */
  readonly tags?: ReadonlyArray<string>;
  /**
   * Last signer roster used the previous time this template was
   * sent. Captured by the editor's "Send and update template" path
   * so the next user starts with the same recipients pre-filled.
   */
  readonly lastSigners?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly color: string;
  }>;
  /**
   * `true` when an example PDF has been uploaded for this template
   * (via `POST /templates/:id/example`). Drives the use-template
   * editor's choice between fetching the original PDF and falling
   * back to a placeholder canvas. Optional on the local model — the
   * seed list defaults to `false`.
   */
  readonly hasExamplePdf?: boolean;
}

/** Returns true if at least one of the template's saved fields matches the given type. */
export function templateHasFieldType(template: TemplateSummary, type: TemplateFieldType): boolean {
  return template.fields.some((f) => f.type === type);
}

/**
 * Build a duplicate of `template` with a fresh id and `(copy)` suffix on the
 * name. Pure — callers thread the result back into local state. The id format
 * mirrors the seed so the templates list stays visually consistent until a
 * server-side templates service replaces this client-only seed.
 *
 * The suffix used to be `Math.random().toString(16).slice(2, 6)` — only
 * 16^4 = 65,536 distinct ids, which produces a >50% collision rate
 * after ~302 duplicates per the birthday paradox. Because the local
 * module store is keyed by id, a collision silently overwrites an
 * earlier card and the duplicate visually disappears. The QA audit
 * (qa/envelope-templates-break-tests) caught this: prefer
 * `crypto.randomUUID()` when available (modern browsers + Node), falling
 * back to a 16-hex-char (64-bit) random suffix otherwise. Either path
 * is collision-resistant for practical SPA usage.
 */
export function duplicateTemplate(template: TemplateSummary): TemplateSummary {
  const suffix = generateDuplicateSuffix();
  return {
    ...template,
    id: `TPL-${suffix}`,
    name: `${template.name} (copy)`,
    uses: 0,
    lastUsed: '—',
  };
}

function generateDuplicateSuffix(): string {
  // Browsers and Node 19+ expose `crypto.randomUUID()` on the globalThis
  // `crypto` object. Use it when available; the surface is identical
  // in both runtimes so no env detection branch is needed.
  const c =
    typeof globalThis !== 'undefined'
      ? (globalThis as { readonly crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (c && typeof c.randomUUID === 'function') {
    // Strip dashes to keep the legacy `TPL-XXXX...` visual shape.
    return c.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }
  // Fallback — concatenate two `Math.random()` draws to reach 16 hex
  // characters of entropy without needing the WebCrypto API.
  return (
    Math.random().toString(16).slice(2, 10).padStart(8, '0') +
    Math.random().toString(16).slice(2, 10).padStart(8, '0')
  ).toUpperCase();
}

/**
 * Production templates start as an empty list. Each user authors their
 * own — either via "New template" on `/templates`, or by clicking
 * "Save as template" on a finished envelope.
 *
 * The list is held in a lightweight module-scoped store so any page in
 * the SPA can read/write without a provider. Pages that own the list
 * (TemplatesListPage) call `setTemplates` after a save / delete so
 * sibling pages (UseTemplatePage, UploadRoute) see the change without
 * re-querying. Replaced wholesale by a server-side store once the
 * templates API client lands.
 *
 * Storybook stories + tests inject fixtures by calling
 * `seedTemplatesForTesting` from `apps/web/src/test/templateFixtures.ts`
 * — never touching the production export directly.
 */
let _templates: ReadonlyArray<TemplateSummary> = [];
const _listeners = new Set<() => void>();

export const TEMPLATES: ReadonlyArray<TemplateSummary> = _templates;

export function getTemplates(): ReadonlyArray<TemplateSummary> {
  return _templates;
}

export function setTemplates(next: ReadonlyArray<TemplateSummary>): void {
  _templates = next;
  for (const fn of _listeners) fn();
}

export function subscribeToTemplates(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function findTemplateById(id: string): TemplateSummary | undefined {
  return _templates.find((t) => t.id === id);
}

export interface ResolvedField {
  readonly id: string;
  readonly page: number;
  readonly type: TemplateFieldType;
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  /**
   * Mirrors `TemplateField.signerIndex`. Consumers map this back to the
   * matching signer in the new envelope's roster (which is pre-filled
   * from `template.lastSigners` in the same order). Undefined for older
   * templates saved before signer-indexing was added.
   */
  readonly signerIndex?: number;
  /**
   * Stable identifier shared by every copy expanded from the same
   * multi-page source rule (e.g. `pageRule: 'all'` on a 3-page doc
   * produces 3 ResolvedFields that all carry the same `linkId`).
   * Drives `useLinkedRemove` in the editor: deleting one peer with a
   * `linkId` opens the "delete from all pages or just this one?"
   * dialog instead of silently dropping a single copy. Undefined for
   * single-page rules (`'first'`, `'last'`, numeric) — there are no
   * peers to link to.
   */
  readonly linkId?: string;
}

/**
 * Project a template's saved field layout onto a target document with a
 * different page count. Used when the user picks "upload a new PDF" and we
 * need to resolve `pageRule: 'last'` etc against the new total page count.
 *
 * Multi-page rules (`'all'`, `'allButLast'`) emit N copies that share a
 * fresh `linkId`. Without it the editor's `useLinkedRemove` hook would
 * see N standalone records and skip the "all pages vs. this page only"
 * confirmation dialog — the very behavior the templates flow regressed.
 */
export function resolveTemplateFields(
  fields: ReadonlyArray<TemplateFieldLayout>,
  totalPages: number,
): ReadonlyArray<ResolvedField> {
  const out: ResolvedField[] = [];
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
    // Only mint a linkId when the source rule expanded into more than
    // one peer — single-page rules don't need linking.
    const linkId = pages.length > 1 ? `tpl-link-${linkSeq++}` : undefined;
    for (const p of pages) {
      const resolved: ResolvedField = {
        id: `tpl-f${id++}`,
        page: p,
        type: tf.type,
        x: tf.x,
        y: tf.y,
        ...(tf.label !== undefined ? { label: tf.label } : {}),
        ...(tf.signerIndex !== undefined ? { signerIndex: tf.signerIndex } : {}),
        ...(linkId !== undefined ? { linkId } : {}),
      };
      out.push(resolved);
    }
  }
  return out;
}
