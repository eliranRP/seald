/**
 * Human-friendly base62 alphabet minus ambiguous glyphs (0, O, 1, I, l).
 * 58 characters × 13 positions = ~10^23 combinations — collision is astronomical.
 */
const SHORT_CODE_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const SHORT_CODE_LENGTH = 13;

/**
 * Generate a fresh 13-char short code using a simple Math.random implementation.
 * This avoids the nanoid package's ESM-only constraint while maintaining the
 * same collision guarantees and output format.
 */
export function generateShortCode(): string {
  let id = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    id += SHORT_CODE_ALPHABET[(Math.random() * SHORT_CODE_ALPHABET.length) | 0];
  }
  return id;
}

/** True iff `s` is 13 chars drawn only from the safe alphabet. */
export function isValidShortCode(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s.length !== SHORT_CODE_LENGTH) return false;
  for (let i = 0; i < s.length; i++) {
    if (!SHORT_CODE_ALPHABET.includes(s[i]!)) return false;
  }
  return true;
}

export { SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH };
