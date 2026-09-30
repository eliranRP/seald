import type { TemplateField, TemplateFieldType } from './templates';

/**
 * One saved field after `pageRule` has been projected onto a document
 * with `totalPages` pages. A numeric page past the end of the PDF is
 * omitted. Multi-page rules share one `linkId`.
 */
export interface ExpandedTemplateField {
  readonly id: string;
  readonly page: number;
  readonly type: TemplateFieldType;
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  readonly signerIndex?: number;
  readonly signerRoleId?: string;
  readonly linkId?: string;
}

/**
 * Project a template field layout onto a target page count.
 *
 * `'all'` and `'allButLast'` emit one copy per page and share a
 * `linkId`. `'first'`, `'last'`, and a numeric page emit one copy and
 * no link id. A numeric page outside `1..totalPages` is skipped.
 * When `lastSigners` is present, a missing `signerRoleId` is filled
 * from `lastSigners[signerIndex]`.
 */
export function expandTemplateLayout(
  fields: ReadonlyArray<TemplateField>,
  totalPages: number,
  lastSigners?: ReadonlyArray<{ readonly id: string }>,
): ReadonlyArray<ExpandedTemplateField> {
  const out: ExpandedTemplateField[] = [];
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
    const linkId = pages.length > 1 ? `tpl-link-${linkSeq++}` : undefined;
    let signerRoleId: string | undefined = tf.signerRoleId;
    if (signerRoleId === undefined && tf.signerIndex !== undefined && lastSigners) {
      signerRoleId = lastSigners[tf.signerIndex]?.id;
    }
    for (const p of pages) {
      const resolved: ExpandedTemplateField = {
        id: `tpl-f${id++}`,
        page: p,
        type: tf.type,
        x: tf.x,
        y: tf.y,
        ...(tf.label !== undefined ? { label: tf.label } : {}),
        ...(tf.signerIndex !== undefined ? { signerIndex: tf.signerIndex } : {}),
        ...(signerRoleId !== undefined ? { signerRoleId } : {}),
        ...(linkId !== undefined ? { linkId } : {}),
      };
      out.push(resolved);
    }
  }
  return out;
}
