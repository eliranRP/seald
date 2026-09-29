import { describe, expect, it } from 'vitest';
import { TAG_PALETTE } from '../tagColors';

describe('TAG_PALETTE', () => {
  it('gives every slot a different background and foreground pair', () => {
    const pairs = TAG_PALETTE.map((slot) => `${slot.bg}|${slot.fg}`);
    expect(new Set(pairs).size).toBe(TAG_PALETTE.length);
  });
});
