import { randomInt } from 'node:crypto';

/**
 * Human-friendly base62 alphabet minus ambiguous glyphs (0, O, 1, I, l).
 * 58 characters × 13 positions = ~10^23 combinations — collision is astronomical.
 */
const SHORT_CODE_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const SHORT_CODE_LENGTH = 13;

/**
 * Generate a fresh 13-char short code using Node's CSPRNG.
 *
 * Uses crypto.randomInt (not Math.random) because short codes appear on the
 * public verification page and in the audit PDF; an attacker who can predict
 * them could enumerate valid verify URLs. crypto.randomInt is uniform and
 * cryptographically secure.
 *
 * Uses node:crypto directly — avoids the nanoid@5 ESM-only constraint that
 * would force a CJS/ESM shim for Jest.
 */
export function generateShortCode(): string {
  let id = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    id += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
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
