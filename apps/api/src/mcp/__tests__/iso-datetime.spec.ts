import { iso, isoDateTimeOffset, isoDateTimeUtc } from 'shared';

describe('iso datetime (pre-zod-4.6 grammar)', () => {
  it('still accepts a no-seconds UTC datetime', () => {
    expect(iso.safeParse('2026-01-01T00:00Z').success).toBe(true);
    expect(isoDateTimeUtc().safeParse('2026-01-01T00:00Z').success).toBe(true);
  });
  it('accepts seconds and fractional seconds', () => {
    expect(iso.safeParse('2026-01-01T00:00:00Z').success).toBe(true);
    expect(iso.safeParse('2026-01-01T00:00:00.123Z').success).toBe(true);
  });
  it('still rejects offsets and junk on the UTC-only form', () => {
    expect(iso.safeParse('2026-01-01T00:00:00+02:00').success).toBe(false);
    expect(iso.safeParse('2026-13-01T00:00:00Z').success).toBe(false);
    expect(iso.safeParse('2026-01-01').success).toBe(false);
  });
  it('offset form accepts no-seconds with Z or an offset', () => {
    const s = isoDateTimeOffset();
    expect(s.safeParse('2026-01-01T00:00+02:00').success).toBe(true);
    expect(s.safeParse('2026-01-01T00:00Z').success).toBe(true);
    expect(s.safeParse('2026-01-01T00:00:00.5-05:30').success).toBe(true);
    expect(s.safeParse('2026-01-01T00:00+25:00').success).toBe(false);
  });
});
