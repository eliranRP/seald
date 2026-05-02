import { describe, it, expect } from 'vitest';
import { formatShortDate, formatShortDateOrDash, formatTimelineWhen } from './dateFormat';

/**
 * BUG-2 regression — sender surfaces (dashboard rows, envelope detail
 * header, sent-confirmation) used to format envelope dates with
 * `month: 'short', day: '2-digit'` only. That meant "Apr 02, 2024" and
 * "Apr 02, 2026" rendered identically, and PMs lost the ability to
 * distinguish "sent last week" from "sent two years ago" on the
 * dashboard. These helpers guarantee the year is appended whenever the
 * date isn't in the *current* calendar year.
 */

const NOW_2026 = new Date('2026-05-02T12:00:00Z');

describe('formatShortDate', () => {
  it('omits the year for dates in the current calendar year', () => {
    expect(formatShortDate('2026-04-02T00:00:00Z', { now: NOW_2026 })).not.toMatch(/2026/);
  });

  it('appends the year for dates in a prior calendar year (regression for BUG-2)', () => {
    const formatted = formatShortDate('2024-04-02T00:00:00Z', { now: NOW_2026 });
    expect(formatted).toMatch(/2024/);
  });

  it('appends the year for dates in a future calendar year', () => {
    expect(formatShortDate('2027-01-02T00:00:00Z', { now: NOW_2026 })).toMatch(/2027/);
  });

  it('returns empty string for null', () => {
    expect(formatShortDate(null, { now: NOW_2026 })).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatShortDate('not-a-date', { now: NOW_2026 })).toBe('');
  });
});

describe('formatShortDateOrDash', () => {
  it('returns an em-dash on null (preserves layout in the envelope header)', () => {
    expect(formatShortDateOrDash(null, { now: NOW_2026 })).toBe('—');
  });

  it('appends the year for cross-year dates', () => {
    expect(formatShortDateOrDash('2024-12-31T00:00:00Z', { now: NOW_2026 })).toMatch(/2024/);
  });
});

describe('formatTimelineWhen', () => {
  it('omits the year for in-year timestamps', () => {
    expect(formatTimelineWhen('2026-04-02T09:30:00Z', { now: NOW_2026 })).not.toMatch(/2026/);
  });

  it('includes the year for cross-year timestamps', () => {
    expect(formatTimelineWhen('2024-12-31T09:30:00Z', { now: NOW_2026 })).toMatch(/2024/);
  });

  it('returns em-dash on null', () => {
    expect(formatTimelineWhen(null, { now: NOW_2026 })).toBe('—');
  });
});
