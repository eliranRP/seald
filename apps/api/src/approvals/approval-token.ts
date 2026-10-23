import { createHash, randomBytes } from 'node:crypto';

/**
 * Approval link tokens (docs/design/mcp-server.md § Owner approval).
 *
 * 32 random bytes, base64url (43 characters). Only the hex SHA-256 is
 * stored. SHA-256 is enough: the token is 256 bits of randomness, not a
 * password. The raw token exists only inside the one email the worker
 * mints it for, and in the `/approve#` fragment or a POST body.
 */
export interface MintedApprovalToken {
  readonly token: string;
  readonly hash: string;
}

export function generateApprovalToken(): MintedApprovalToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashApprovalToken(token) };
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** The shape every token and CSRF value has: 43 base64url characters. */
export function looksLikeApprovalToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
