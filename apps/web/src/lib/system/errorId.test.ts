import { describe, expect, it } from 'vitest';
import { generateErrorId } from './errorId';

describe('generateErrorId', () => {
  it('returns err_ plus five base32 characters', () => {
    expect(generateErrorId()).toMatch(/^err_[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it('is deterministic for a fixed random source', () => {
    expect(generateErrorId(() => 0)).toBe('err_00000');
  });

  it('stays in range when random returns just under 1', () => {
    expect(generateErrorId(() => 0.999999)).toBe('err_ZZZZZ');
  });
});
