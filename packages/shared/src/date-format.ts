/**
 * Date rendering for date fields (WP-07). Pure and dependency-free so the
 * API (fill + burn-in) and the SPA (preview) format identically.
 *
 * An envelope may name one of {@link DATE_FORMATS} and an IANA timezone.
 * Both are optional: with neither set the date field keeps the text the
 * signer sent.
 */
export const DATE_FORMATS = [
  'yyyy-MM-dd',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'dd.MM.yyyy',
  'MMM d, yyyy',
  'd MMMM yyyy',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === 'string' && (DATE_FORMATS as readonly string[]).includes(value);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface CalendarDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** True for a real calendar date (rejects 2026-02-30). */
export function isRealCalendarDate(d: CalendarDate): boolean {
  if (d.year < 1000 || d.year > 9999 || d.month < 1 || d.month > 12 || d.day < 1) return false;
  const probe = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return probe.getUTCMonth() === d.month - 1 && probe.getUTCDate() === d.day;
}

/** True when `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of an instant as seen in `timeZone` (default UTC). */
export function calendarDateInZone(instant: Date, timeZone?: string | null): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function formatCalendarDate(d: CalendarDate, format: DateFormat): string {
  const monthName = MONTHS[d.month - 1] ?? '';
  switch (format) {
    case 'yyyy-MM-dd':
      return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
    case 'MM/dd/yyyy':
      return `${pad(d.month, 2)}/${pad(d.day, 2)}/${pad(d.year, 4)}`;
    case 'dd/MM/yyyy':
      return `${pad(d.day, 2)}/${pad(d.month, 2)}/${pad(d.year, 4)}`;
    case 'dd.MM.yyyy':
      return `${pad(d.day, 2)}.${pad(d.month, 2)}.${pad(d.year, 4)}`;
    case 'MMM d, yyyy':
      return `${monthName.slice(0, 3)} ${d.day}, ${d.year}`;
    case 'd MMMM yyyy':
      return `${d.day} ${monthName} ${d.year}`;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function fromParts(y: number, m: number, d: number): CalendarDate | null {
  const date = { year: y, month: m, day: d };
  return isRealCalendarDate(date) ? date : null;
}

function monthIndex(name: string, shortOnly: boolean): number {
  const lower = name.toLowerCase();
  return MONTHS.findIndex((n) =>
    shortOnly ? n.slice(0, 3).toLowerCase() === lower : n.toLowerCase() === lower,
  );
}

/** Parse one text rendering of `format`; null when it does not match. */
function parseWithFormat(text: string, format: DateFormat): CalendarDate | null {
  switch (format) {
    case 'yyyy-MM-dd': {
      const m = ISO_DATE.exec(text);
      return m ? fromParts(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    }
    case 'MM/dd/yyyy': {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
      return m ? fromParts(Number(m[3]), Number(m[1]), Number(m[2])) : null;
    }
    case 'dd/MM/yyyy': {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
      return m ? fromParts(Number(m[3]), Number(m[2]), Number(m[1])) : null;
    }
    case 'dd.MM.yyyy': {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
      return m ? fromParts(Number(m[3]), Number(m[2]), Number(m[1])) : null;
    }
    case 'MMM d, yyyy': {
      const m = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(text);
      if (!m) return null;
      const idx = monthIndex(m[1] ?? '', true);
      return idx < 0 ? null : fromParts(Number(m[3]), idx + 1, Number(m[2]));
    }
    case 'd MMMM yyyy': {
      const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(text);
      if (!m) return null;
      const idx = monthIndex(m[2] ?? '', false);
      return idx < 0 ? null : fromParts(Number(m[3]), idx + 1, Number(m[1]));
    }
  }
}

/**
 * Parse what a signer sent for a date field. Accepts a calendar date or
 * ISO 8601 instant (`2026-01-05`, `2026-01-05T10:00:00Z`, converted into
 * `timeZone`), the envelope's own format, or any other supported format.
 * `dd/MM/yyyy` and `MM/dd/yyyy` look alike, so the envelope's format is
 * tried first.
 */
export function parseDateValue(
  text: string,
  options: { readonly format?: DateFormat | null; readonly timeZone?: string | null } = {},
): CalendarDate | null {
  const trimmed = text.trim();
  if (ISO_DATETIME.test(trimmed)) {
    const instant = new Date(trimmed);
    if (Number.isNaN(instant.getTime())) return null;
    return calendarDateInZone(instant, options.timeZone);
  }
  const order: DateFormat[] = [];
  if (options.format) order.push(options.format);
  for (const f of DATE_FORMATS) if (!order.includes(f)) order.push(f);
  for (const f of order) {
    const parsed = parseWithFormat(trimmed, f);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * The text a date field should show: the parsed date rendered in the
 * envelope's format. Without a format, or when the text is not a date,
 * the input comes back unchanged (legacy behaviour).
 */
export function renderDateValue(
  text: string,
  options: { readonly format?: string | null; readonly timeZone?: string | null },
): string {
  const format = options.format;
  if (!isDateFormat(format)) return text;
  const parsed = parseDateValue(text, { format, timeZone: options.timeZone ?? null });
  return parsed ? formatCalendarDate(parsed, format) : text;
}
