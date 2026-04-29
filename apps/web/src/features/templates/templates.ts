/**
 * Templates feature — types + seed data.
 *
 * Templates capture a saved field layout (initial / signature / date / text /
 * checkbox positions) on a representative document, so a sender can pick a
 * template, swap in a new PDF, and have the layout snap onto it. The seed
 * data here mirrors the design canvas mock at
 * `Design-Guide/project/templates-flow/TemplatesList.jsx` — it stays purely
 * client-side until a backend templates service lands.
 */

export type TemplateFieldType = 'signature' | 'initial' | 'date' | 'text' | 'checkbox';

/**
 * Where a saved field lands when the template is applied to a target document.
 *
 * - `'all'` — every page in the target.
 * - `'allButLast'` — every page except the final one (initials on body pages).
 * - `'first' | 'last'` — first / last page only.
 * - A page number (1-indexed) — exact page; ignored if the target is shorter.
 */
export type TemplatePageRule = 'all' | 'allButLast' | 'first' | 'last' | number;

export interface TemplateFieldLayout {
  readonly type: TemplateFieldType;
  readonly pageRule: TemplatePageRule;
  /** PDF point coordinate, top-left origin. */
  readonly x: number;
  readonly y: number;
  readonly label?: string;
}

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
}

const MSA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'all', x: 522, y: 50 },
  { type: 'date', pageRule: 'last', x: 60, y: 488 },
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'signature', pageRule: 'last', x: 320, y: 540 },
  { type: 'text', pageRule: 'last', x: 60, y: 612, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 320, y: 612, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 60, y: 672, label: 'Title' },
  { type: 'text', pageRule: 'last', x: 320, y: 672, label: 'Title' },
];

const NDA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'allButLast', x: 522, y: 50 },
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'signature', pageRule: 'last', x: 320, y: 540 },
  { type: 'date', pageRule: 'last', x: 60, y: 612 },
  { type: 'date', pageRule: 'last', x: 320, y: 612 },
];

const ICA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'all', x: 522, y: 50 },
  { type: 'signature', pageRule: 'last', x: 60, y: 520 },
  { type: 'signature', pageRule: 'last', x: 320, y: 520 },
  { type: 'date', pageRule: 'last', x: 60, y: 588 },
  { type: 'date', pageRule: 'last', x: 320, y: 588 },
  { type: 'text', pageRule: 'last', x: 60, y: 644, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 320, y: 644, label: 'Print name' },
  { type: 'text', pageRule: 'first', x: 60, y: 200, label: 'Effective date' },
  { type: 'text', pageRule: 'first', x: 320, y: 200, label: 'Compensation' },
  { type: 'checkbox', pageRule: 'first', x: 60, y: 280 },
  { type: 'checkbox', pageRule: 'first', x: 60, y: 320 },
];

const RELEASE_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'date', pageRule: 'last', x: 320, y: 540 },
  { type: 'text', pageRule: 'last', x: 60, y: 612, label: 'Print name' },
];

export const TEMPLATES: ReadonlyArray<TemplateSummary> = [
  {
    id: 'TPL-AC04',
    name: 'Unconditional waiver — final payment',
    pages: 6,
    fieldCount: MSA_FIELDS.length,
    lastUsed: 'Apr 22',
    uses: 14,
    cover: '#EEF2FF',
    exampleFile: 'Master Services Agreement.pdf',
    fields: MSA_FIELDS,
  },
  {
    id: 'TPL-7B12',
    name: 'Mutual NDA — short form',
    pages: 3,
    fieldCount: NDA_FIELDS.length,
    lastUsed: 'Apr 18',
    uses: 46,
    cover: '#FFFBEB',
    exampleFile: 'Mutual NDA.pdf',
    fields: NDA_FIELDS,
  },
  {
    id: 'TPL-29DA',
    name: 'Independent contractor agreement',
    pages: 8,
    fieldCount: ICA_FIELDS.length,
    lastUsed: 'Apr 11',
    uses: 7,
    cover: '#ECFDF5',
    exampleFile: 'Independent Contractor Agreement.pdf',
    fields: ICA_FIELDS,
  },
  {
    id: 'TPL-5F0E',
    name: 'Photography release',
    pages: 2,
    fieldCount: RELEASE_FIELDS.length,
    lastUsed: 'Mar 30',
    uses: 22,
    cover: '#FDF2F8',
    exampleFile: 'Photography Release.pdf',
    fields: RELEASE_FIELDS,
  },
];

export function findTemplateById(id: string): TemplateSummary | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

interface ResolvedField {
  readonly id: string;
  readonly page: number;
  readonly type: TemplateFieldType;
  readonly x: number;
  readonly y: number;
  readonly label?: string;
}

/**
 * Project a template's saved field layout onto a target document with a
 * different page count. Used when the user picks "upload a new PDF" and we
 * need to resolve `pageRule: 'last'` etc against the new total page count.
 */
export function resolveTemplateFields(
  fields: ReadonlyArray<TemplateFieldLayout>,
  totalPages: number,
): ReadonlyArray<ResolvedField> {
  const out: ResolvedField[] = [];
  let id = 1;
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
    for (const p of pages) {
      const resolved: ResolvedField = {
        id: `tpl-f${id++}`,
        page: p,
        type: tf.type,
        x: tf.x,
        y: tf.y,
        ...(tf.label !== undefined ? { label: tf.label } : {}),
      };
      out.push(resolved);
    }
  }
  return out;
}
