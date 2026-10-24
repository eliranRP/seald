/** Crockford-style base32, so there are no look-alike letters (no I, L, O, U). */
const DIGITS = '0123456789';
// cspell:disable-next-line
const LETTERS = 'ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET = DIGITS + LETTERS;
const ID_LENGTH = 5;

/**
 * Short, support-friendly id (`err_7Q2K9`) generated when the error boundary
 * catches. It is shown to the user, copied on request and sent with the
 * error report, so support can match a screenshot to a log line. It carries
 * no information about the error, and the stack is never shown.
 */
export function generateErrorId(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ID_LENGTH; i += 1) {
    out += ALPHABET.charAt(Math.floor(random() * ALPHABET.length) % ALPHABET.length);
  }
  return `err_${out}`;
}
