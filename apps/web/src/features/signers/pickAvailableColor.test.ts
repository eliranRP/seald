import { describe, it, expect } from 'vitest';
import { pickAvailableColor } from './pickAvailableColor';

const PALETTE = ['#A', '#B', '#C', '#D', '#E', '#F'] as const;

describe('pickAvailableColor', () => {
  it('returns the first palette color when nothing is in use', () => {
    expect(pickAvailableColor(PALETTE, [])).toBe('#A');
  });

  it('returns the first unused color when some are in use', () => {
    expect(pickAvailableColor(PALETTE, ['#A', '#B'])).toBe('#C');
  });

  it('skips holes — picks the lowest-index unused color, not the next-after-largest', () => {
    // Mid-list signer was removed: in-use set is {#A, #C}; expect #B,
    // not #D (which `prev.length % palette.length = 2 = #C` would return).
    expect(pickAvailableColor(PALETTE, ['#A', '#C'])).toBe('#B');
  });

  it('compares case-insensitively so #abcdef and #ABCDEF are treated as the same color', () => {
    expect(pickAvailableColor(PALETTE, ['#a', '#B'])).toBe('#C');
  });

  it('handles duplicate colors in `used` without skipping more palette slots than needed', () => {
    expect(pickAvailableColor(PALETTE, ['#A', '#A', '#B'])).toBe('#C');
  });

  it('falls back to a deterministic modulo when every palette slot is taken', () => {
    // 6 palette colors all in use plus one extra → wraps via `used.length % palette.length`.
    expect(pickAvailableColor(PALETTE, ['#A', '#B', '#C', '#D', '#E', '#F'])).toBe('#A');
    expect(pickAvailableColor(PALETTE, ['#A', '#B', '#C', '#D', '#E', '#F', '#A'])).toBe('#B');
  });
});
