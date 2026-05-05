import {
  generateShortCode,
  isValidShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from '../short-code';

describe('short-code', () => {
  describe('generateShortCode', () => {
    it('returns a 13-character string', () => {
      const code = generateShortCode();
      expect(typeof code).toBe('string');
      expect(code).toHaveLength(SHORT_CODE_LENGTH);
    });

    it('uses only characters from the safe alphabet', () => {
      for (let i = 0; i < 200; i++) {
        const code = generateShortCode();
        for (const ch of code) {
          expect(SHORT_CODE_ALPHABET).toContain(ch);
        }
      }
    });

    it('never contains ambiguous characters 0, O, 1, I, l', () => {
      for (let i = 0; i < 500; i++) {
        const code = generateShortCode();
        expect(code).not.toMatch(/[0OIl1]/);
      }
    });

    it('produces distinct codes on back-to-back calls', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) seen.add(generateShortCode());
      // Birthday-problem space is enormous; 500 trials should yield 500 unique.
      expect(seen.size).toBe(500);
    });
  });

  describe('isValidShortCode', () => {
    it('accepts a freshly generated code', () => {
      expect(isValidShortCode(generateShortCode())).toBe(true);
    });

    it('rejects non-strings', () => {
      expect(isValidShortCode(null)).toBe(false);
      expect(isValidShortCode(undefined)).toBe(false);
      expect(isValidShortCode(123)).toBe(false);
      expect(isValidShortCode({})).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(isValidShortCode('abcdef')).toBe(false);
      expect(isValidShortCode('2345678abcdefghi')).toBe(false);
    });

    it('rejects strings containing ambiguous characters', () => {
      expect(isValidShortCode('0bcdefghijklm')).toBe(false);
      expect(isValidShortCode('Obcdefghijklm')).toBe(false);
      expect(isValidShortCode('1bcdefghijklm')).toBe(false);
      expect(isValidShortCode('Ibcdefghijklm')).toBe(false);
      expect(isValidShortCode('lbcdefghijklm')).toBe(false);
    });

    it('narrows the type in a type guard', () => {
      const maybe: unknown = generateShortCode();
      if (isValidShortCode(maybe)) {
        // TS should infer `string` here; this is a compile-time smoke test.
        const n: number = maybe.length;
        expect(n).toBe(13);
      } else {
        throw new Error('unreachable');
      }
    });
  });
});
