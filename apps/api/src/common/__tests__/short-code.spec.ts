import { SHORT_CODE_ALPHABET, SHORT_CODE_DEFAULT_LENGTH, generateShortCode } from '../short-code';

describe('generateShortCode', () => {
  it('produces a string of the requested length', () => {
    expect(generateShortCode()).toHaveLength(SHORT_CODE_DEFAULT_LENGTH);
    expect(generateShortCode(7)).toHaveLength(7);
    expect(generateShortCode(32)).toHaveLength(32);
  });

  it('only emits characters from the supplied alphabet (no off-by-one)', () => {
    const id = generateShortCode(5_000);
    const allowed = new Set(SHORT_CODE_ALPHABET);
    for (const ch of id) {
      expect(allowed.has(ch)).toBe(true);
    }
  });

  it('reaches every character in the alphabet given enough samples', () => {
    // With 200_000 picks across a 57-char alphabet, the probability of
    // missing any single character is ≈ (56/57)^200000 ≈ 10^-1525, so a
    // failure here means the picker is biased away from at least one
    // index — exactly the regression we want to catch.
    const seen = new Set<string>();
    const id = generateShortCode(200_000);
    for (const ch of id) seen.add(ch);
    expect(seen.size).toBe(SHORT_CODE_ALPHABET.length);
  });

  it('asks the picker for an index in [0, alphabet.length) on every position', () => {
    const calls: number[] = [];
    const stub = (max: number) => {
      calls.push(max);
      return 0; // pin to first char so the assertion below is deterministic
    };
    const id = generateShortCode(8, SHORT_CODE_ALPHABET, stub);
    // 8 picks → 8 calls, each constrained to [0, alphabet.length).
    expect(calls).toHaveLength(8);
    for (const max of calls) expect(max).toBe(SHORT_CODE_ALPHABET.length);
    // Pinning to 0 returns the first alphabet char each time — proves
    // the loop indexes the alphabet by the picker's output (not by some
    // internal modulo on a wider value).
    expect(id).toBe(SHORT_CODE_ALPHABET[0]!.repeat(8));
  });

  it('hits the full index range when the picker walks 0..length-1', () => {
    let counter = 0;
    const walking = (max: number) => counter++ % max;
    const id = generateShortCode(SHORT_CODE_ALPHABET.length, SHORT_CODE_ALPHABET, walking);
    // The walking picker emits 0,1,2,…,N-1 in order, so the output is
    // exactly the alphabet — proves no off-by-one and that every index
    // is reachable through the seam.
    expect(id).toBe(SHORT_CODE_ALPHABET);
  });

  it('rejects out-of-range picker outputs', () => {
    expect(() => generateShortCode(1, 'AB', () => 2)).toThrow(RangeError);
    expect(() => generateShortCode(1, 'AB', () => -1)).toThrow(RangeError);
    expect(() => generateShortCode(1, 'AB', () => 0.5)).toThrow(RangeError);
  });

  it('rejects non-positive or non-integer lengths', () => {
    expect(() => generateShortCode(0)).toThrow(RangeError);
    expect(() => generateShortCode(-1)).toThrow(RangeError);
    expect(() => generateShortCode(1.5)).toThrow(RangeError);
  });

  it('rejects degenerate alphabets', () => {
    expect(() => generateShortCode(4, '')).toThrow(RangeError);
    expect(() => generateShortCode(4, 'x')).toThrow(RangeError);
  });

  it('honors a custom alphabet end-to-end', () => {
    const alpha = 'AB';
    const id = generateShortCode(64, alpha);
    expect(id).toMatch(/^[AB]{64}$/);
  });
});
