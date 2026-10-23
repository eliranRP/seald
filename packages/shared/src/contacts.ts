/**
 * Pure helpers for pasted contact lists, shared by the Contacts page (chips)
 * and the API (`POST /contacts/bulk` re-validates every address).
 */

/** Same loose shape check the SPA has always used; the API DTO is stricter. */
const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Longest address the API stores (matches `CreateContactDto`). */
export const CONTACT_EMAIL_MAX = 320;

/** True when `value` looks like `name@host.tld`. */
export function isEmailShape(value: string): boolean {
  return value.length <= CONTACT_EMAIL_MAX && EMAIL_SHAPE.test(value);
}

/**
 * Split pasted text into trimmed, lower-cased tokens. Commas, semicolons,
 * whitespace and newlines all separate. Empty tokens are dropped; order is
 * kept and repeats are kept (the caller decides what a repeat means).
 */
export function splitEmailList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Guess a display name from an address: the local part split on `.`, `_`
 * and `-`, each word capitalised (`hannah.wills@quill.vc` becomes
 * `Hannah Wills`; `nora@acme.co` becomes `Nora`). A local part with no
 * letters falls back to the whole address.
 */
export function guessContactName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local
    .split(/[._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const name = words.join(' ');
  return name.length > 0 ? name : email;
}
