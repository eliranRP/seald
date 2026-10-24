import type { SignMeDocument, SignMeField } from '@/features/signing';

/**
 * Fields the signer does not fill by hand: their name and today's date are
 * put in for them (still editable). They do not count in the progress bar.
 */
export function isAutoField(f: SignMeField): boolean {
  return f.kind === 'date' || f.kind === 'name' || (f.kind === 'text' && f.link_id === 'name');
}

/** True when a field counts as filled. */
function filled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

/**
 * Reading order across the whole envelope: document order, then page, then
 * top to bottom, then left to right.
 */
export function orderFields(
  fields: ReadonlyArray<SignMeField>,
  documents: ReadonlyArray<SignMeDocument> = [],
): SignMeField[] {
  const docRank = new Map(documents.map((d, i) => [d.id, i] as const));
  return [...fields].sort((a, b) => {
    const da = docRank.get(a.document_id ?? '') ?? 0;
    const db = docRank.get(b.document_id ?? '') ?? 0;
    if (da !== db) return da - db;
    if (a.page !== b.page) return a.page - b.page;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}

/**
 * The next thing for the signer to do: the first required field still
 * empty, hand-filled ones before auto ones. `skipId` is the field just
 * filled, whose cached state may not have caught up yet.
 */
export function nextTodoField(
  fields: ReadonlyArray<SignMeField>,
  documents: ReadonlyArray<SignMeDocument> = [],
  skipId?: string,
): SignMeField | null {
  const todo = orderFields(fields, documents).filter(
    (f) => f.required && f.id !== skipId && !filled(f),
  );
  return todo.find((f) => !isAutoField(f)) ?? todo[0] ?? null;
}

/** Today as `yyyy-MM-dd` in the signer's local time: what a date field takes. */
export function todayIso(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-23" shown as "Oct 23, 2026"; any other text is shown as it is. */
export function displayDate(value: string): string {
  const m = ISO_DATE.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return month === undefined ? value : `${month} ${Number(m[3])}, ${m[1]}`;
}
