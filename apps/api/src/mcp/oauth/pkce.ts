import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PKCE (RFC 7636), S256 only. OAuth 2.1 drops `plain`, and so does this
 * server: the authorization request must carry `code_challenge_method=S256`.
 */

/** `code_verifier`: 43–128 characters of the unreserved set. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** An S256 challenge is base64url(SHA-256(verifier)) without padding: 43 characters. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && VERIFIER.test(value);
}

export function isValidS256Challenge(value: unknown): value is string {
  return typeof value === 'string' && CHALLENGE.test(value);
}

export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Constant-time check that `verifier` hashes to `challenge`. */
export function verifyS256(verifier: unknown, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidS256Challenge(challenge)) return false;
  const a = Buffer.from(s256Challenge(verifier), 'ascii');
  const b = Buffer.from(challenge, 'ascii');
  return a.length === b.length && timingSafeEqual(a, b);
}
