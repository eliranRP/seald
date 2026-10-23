import { describe, expect, it } from 'vitest';
import { relativeAgo } from './relativeAgo';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeAgo', () => {
  it.each([
    [30_000, 'just now'],
    [12 * MIN, '12m ago'],
    [2 * HOUR, '2h ago'],
    [23 * HOUR, '23h ago'],
    [5 * DAY, '5d ago'],
    [14 * DAY, '2w ago'],
    [29 * DAY, '4w ago'],
    [35 * DAY, '1mo ago'],
    [95 * DAY, '3mo ago'],
    [400 * DAY, '1y ago'],
  ])('%d ms back reads %s', (ms, expected) => {
    expect(relativeAgo(ago(ms), NOW)).toBe(expected);
  });

  it('treats a time in the future as just now', () => {
    expect(relativeAgo(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe('just now');
  });

  it('returns an empty string for null, undefined or garbage', () => {
    expect(relativeAgo(null, NOW)).toBe('');
    expect(relativeAgo(undefined, NOW)).toBe('');
    expect(relativeAgo('not a date', NOW)).toBe('');
  });
});
