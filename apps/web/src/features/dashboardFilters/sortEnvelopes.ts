/**
 * Dashboard list sort — URL contract only.
 *
 * The actual ordering is performed server-side: the `/envelopes` list
 * endpoint accepts `?sort=<key>&dir=<asc|desc>`, orders by that
 * column, and keysets its cursor accordingly. The frontend's only
 * job is to parse the sort state out of the URL and reflect it in
 * the column headers — so this module is just the parser + the
 * shared key/dir vocabulary.
 *
 * Sort-key vocabulary matches the API's `EnvelopeSortKey` (minus the
 * `created` key, which the dashboard doesn't surface a column for).
 * The dashboard column id `document` maps to the `title` sort key —
 * see the `COLUMN_SORT_KEY` map in `DashboardPage`.
 */

export const SORT_KEYS = ['title', 'signers', 'progress', 'status', 'date'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export interface SortState {
  readonly key: SortKey;
  readonly dir: SortDir;
}

/** No `?sort=` param → newest-updated-first. */
export const DEFAULT_SORT: SortState = { key: 'date', dir: 'desc' };

const SORT_KEY_SET = new Set<string>(SORT_KEYS);

/**
 * Decode `?sort=<key>&dir=<asc|desc>` from the dashboard URL.
 * Unknown / missing values fall back to {@link DEFAULT_SORT}'s parts
 * — never throws.
 */
export function parseSort(params: URLSearchParams): SortState {
  const rawKey = params.get('sort');
  const rawDir = params.get('dir');
  const key: SortKey =
    rawKey !== null && SORT_KEY_SET.has(rawKey) ? (rawKey as SortKey) : DEFAULT_SORT.key;
  const dir: SortDir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : DEFAULT_SORT.dir;
  return { key, dir };
}
