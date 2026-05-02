import { describe, expect, it } from 'vitest';
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  makeId,
  makeLinkId,
  resolveTargetPages,
} from './lib';

// Targets the small pure helpers `lib.test.ts` doesn't already cover so the
// module's branch profile (clampZoom infinity guard, both id-prefix shapes,
// every `resolveTargetPages` mode) lights up.

describe('clampZoom', () => {
  it('returns the default when given a non-finite number (NaN/Infinity)', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_DEFAULT);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(ZOOM_DEFAULT);
  });

  it('clamps below ZOOM_MIN up to ZOOM_MIN', () => {
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN);
  });

  it('clamps above ZOOM_MAX down to ZOOM_MAX', () => {
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX);
  });

  it('rounds to two decimal places so step accumulation does not drift', () => {
    expect(clampZoom(1.234)).toBeCloseTo(1.23, 5);
    expect(clampZoom(1.236)).toBeCloseTo(1.24, 5);
  });
});

describe('makeId / makeLinkId', () => {
  it('makeId emits the `f_` field prefix and is unique per call', () => {
    const a = makeId();
    const b = makeId();
    expect(a).toMatch(/^f_[a-z0-9]+_[a-z0-9]+$/i);
    expect(a).not.toEqual(b);
  });

  it('makeLinkId emits the `l_` link prefix that the remove flow scans for', () => {
    expect(makeLinkId()).toMatch(/^l_[a-z0-9]+_[a-z0-9]+$/i);
  });
});

describe('resolveTargetPages', () => {
  it('returns an empty list for `this` (caller already has the source page)', () => {
    expect(resolveTargetPages('this', 1, 5)).toEqual([]);
  });

  it('returns every page except the source for `all`', () => {
    expect(resolveTargetPages('all', 2, 4)).toEqual([1, 3, 4]);
  });

  it('returns every page except the source AND the last for `allButLast`', () => {
    expect(resolveTargetPages('allButLast', 1, 4)).toEqual([2, 3]);
  });

  it('returns just the last page for `last` when source is not the last page', () => {
    expect(resolveTargetPages('last', 2, 4)).toEqual([4]);
  });

  it('returns an empty list for `last` when the source IS already the last page', () => {
    expect(resolveTargetPages('last', 4, 4)).toEqual([]);
  });

  it('filters out the source and out-of-range pages for `custom`', () => {
    expect(resolveTargetPages('custom', 2, 5, [0, 2, 3, 6])).toEqual([3]);
  });

  it('treats a missing customPages list as no targets in `custom` mode', () => {
    expect(resolveTargetPages('custom', 1, 3)).toEqual([]);
  });

  it('returns an empty list for an unknown mode (defensive default branch)', () => {
    // Cast through unknown — the `default` branch is unreachable through the
    // narrowed `PlacePagesMode` union but exists as a guard for forward-
    // compat. Hitting it here keeps the branch coverage honest.
    expect(resolveTargetPages('bogus' as unknown as 'this', 1, 3)).toEqual([]);
  });
});
