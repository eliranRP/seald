import type { Envelope } from './envelope.entity';
import { InvalidCursorError, type EnvelopeSortKey, type ListCursor } from './envelopes.repository';

/**
 * Shared keyset-cursor codec + sort-value helpers for the envelope
 * list. Both the Postgres adapter and the in-memory test double use
 * these so the on-the-wire cursor format is guaranteed identical
 * (the e2e suite runs against the in-memory repo; production runs
 * against Pg — they must agree byte-for-byte).
 *
 * Cursor wire format: `base64("<sortValue><updatedAt><id>")`.
 * The unit-separator (``) can't appear in any of the three
 * fields (sort values are dates / lower-cased titles / numbers, all
 * separator-free), so a plain split is unambiguous.
 */

const SEP = '';

/**
 * Fixed presentation order for the Status column sort. Independent of
 * the `ENVELOPE_STATUSES` declaration order so re-ordering the enum
 * upstream never changes the dashboard sort.
 */
export const STATUS_SORT_ORDINAL: Record<Envelope['status'], number> = {
  draft: 0,
  awaiting_others: 1,
  sealing: 2,
  completed: 3,
  declined: 4,
  expired: 5,
  canceled: 6,
};

/** signed/total expressed as a 0..1000 integer "permille" (0 for no signers). */
function progressPermille(e: Envelope): number {
  const total = e.signers.length;
  if (total === 0) return 0;
  const signed = e.signers.filter((s) => s.signed_at !== null).length;
  return Math.trunc((signed * 1000) / Math.max(total, 1));
}

/**
 * Stringified value of the active sort expression for an envelope —
 * this is what gets baked into the next-page cursor. Mirrors the SQL
 * expressions in `EnvelopesPgRepository.listByOwner`.
 */
export function sortValueForKey(e: Envelope, key: EnvelopeSortKey): string {
  switch (key) {
    case 'date':
      return e.updated_at;
    case 'created':
      return e.created_at;
    case 'title':
      return e.title.toLowerCase();
    case 'status':
      return String(STATUS_SORT_ORDINAL[e.status]);
    case 'signers':
      return String(e.signers.length);
    case 'progress':
      return String(progressPermille(e));
  }
}

/** Whether a sort key compares as a number (vs a string). */
export function isNumericSortKey(key: EnvelopeSortKey): boolean {
  return key === 'status' || key === 'signers' || key === 'progress';
}

export function encodeListCursor(sortValue: string, updatedAt: string, id: string): string {
  return Buffer.from(`${sortValue}${SEP}${updatedAt}${SEP}${id}`, 'utf8').toString('base64');
}

export function decodeListCursor(cursor: string): ListCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  const parts = decoded.split(SEP);
  if (parts.length !== 3) throw new InvalidCursorError();
  const [sort_value, updated_at, id] = parts as [string, string, string];
  if (!/^\d{4}-\d{2}-\d{2}T/.test(updated_at)) throw new InvalidCursorError();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InvalidCursorError();
  return { sort_value, updated_at, id };
}
