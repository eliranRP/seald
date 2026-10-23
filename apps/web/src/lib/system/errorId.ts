/** Crockford-style base32 without look-alikes (no I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
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
