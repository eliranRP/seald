/**
 * Tiny date-formatting helpers for sender surfaces (dashboard rows,
 * envelope detail header, sent-confirmation card).
 *
 * Why these exist: the dashboard and envelope-detail pages used to
 * format dates with `month: 'short', day: '2-digit'` only, which made
 * "Apr 02 2024" and "Apr 02 2026" indistinguishable on the row. PMs
 * found "find the envelope I sent last week" became impossible whenever
 * the user had old envelopes still sitting in their list — and a
 * December envelope viewed in early January looked like it shipped a
 * week ago when it was a year old. These helpers always include the
 * year for any date that isn't in the *current* calendar year, while
 * keeping the compact "Apr 02" rendering for in-year dates so the
 * dashboard table doesn't widen on every row.
 *
 * The "now" parameter is injectable for deterministic tests.
 */

interface FormatOpts {
  /**
   * Reference "now" used to decide whether the year is implied. Defaults
   * to `new Date()`. Tests pass a fixed Date so assertions are stable
   * across CI runs.
   */
  readonly now?: Date;
}

function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Compact "Apr 02" / "Apr 02, 2024" formatter — adds the year only when
 * the date is in a different calendar year than `now`. Empty string for
 * null/invalid input, mirroring the previous in-line `formatDate` callers.
 */
export function formatShortDate(iso: string | null, opts: FormatOpts = {}): string {
  const d = parseIso(iso);
  if (!d) return '';
  const now = opts.now ?? new Date();
  if (isSameYear(d, now)) {
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

/**
 * Same year-aware rule for the envelope-detail header's "Sent on" line.
 * The fallback for null/invalid input is the em-dash literal the previous
 * `formatDateOnly` used, so existing layouts don't reflow.
 */
export function formatShortDateOrDash(iso: string | null, opts: FormatOpts = {}): string {
  const d = parseIso(iso);
  if (!d) return '—';
  return formatShortDate(iso, opts);
}

/**
 * Long form for the timeline ("Apr 02, 09:30" / "Apr 02, 2024, 09:30").
 * Same year-elision rule as `formatShortDate`. Em-dash on null.
 */
export function formatTimelineWhen(iso: string | null, opts: FormatOpts = {}): string {
  const d = parseIso(iso);
  if (!d) return '—';
  const now = opts.now ?? new Date();
  if (isSameYear(d, now)) {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
