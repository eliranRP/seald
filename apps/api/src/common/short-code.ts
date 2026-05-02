import { randomInt } from 'node:crypto';

/**
 * Crockford-ish base-58 alphabet (no `0/O/1/l/I`) used for human-friendly
 * short codes that index test/seed envelopes.
 */
export const SHORT_CODE_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** Default length keeps the entropy ≳ 75 bits, plenty for opaque seed ids. */
export const SHORT_CODE_DEFAULT_LENGTH = 13;

/**
 * Pick a uniformly-distributed integer in `[0, max)`. Defaults to
 * `crypto.randomInt`, which uses rejection sampling under the hood — the
 * de-biased replacement for the legacy `randomBytes(n)[i] % max` form
 * CodeQL flagged as `js/biased-cryptographic-random`. The optional
 * `pickIndex` seam exists strictly so unit tests can inject a
 * deterministic picker and prove the loop wiring without introducing
 * statistical flake; production callers always use the default.
 */
export type IndexPicker = (maxExclusive: number) => number;

const defaultPickIndex: IndexPicker = (max) => randomInt(0, max);

export function generateShortCode(
  length: number = SHORT_CODE_DEFAULT_LENGTH,
  alphabet: string = SHORT_CODE_ALPHABET,
  pickIndex: IndexPicker = defaultPickIndex,
): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('generateShortCode: length must be a positive integer');
  }
  if (alphabet.length < 2) {
    throw new RangeError('generateShortCode: alphabet must have ≥ 2 characters');
  }
  let id = '';
  for (let i = 0; i < length; i += 1) {
    const idx = pickIndex(alphabet.length);
    if (!Number.isInteger(idx) || idx < 0 || idx >= alphabet.length) {
      throw new RangeError(`generateShortCode: pickIndex returned out-of-range value ${idx}`);
    }
    id += alphabet[idx];
  }
  return id;
}
