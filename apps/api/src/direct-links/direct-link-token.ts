import { createHash, randomBytes } from 'node:crypto';
import { DIRECT_LINK_TOKEN_PATTERN } from 'shared';

/**
 * Direct link tokens (WP-37): `dl_` + 32 random bytes as base64url (43
 * characters, 256 bits). Only the hex SHA-256 is stored. The token is
 * high-entropy random data, not a password, so a fast hash is the right
 * choice (same reasoning as API keys, see `api-keys/api-key-secret.ts`).
 */
export const TOKEN_PREFIX = 'dl_';
const TOKEN_BYTES = 32;
/** Characters of the token body kept for display, after `dl_`. */
export const DISPLAY_PREFIX_CHARS = 6;

export interface GeneratedDirectLinkToken {
  /** Shown to the owner once; never stored. */
  readonly token: string;
  /** `dl_` + first characters; display only. */
  readonly prefix: string;
  readonly tokenHash: string;
}

export function hashDirectLinkToken(token: string): string {
  // codeql[js/insufficient-password-hash]
  return createHash('sha256').update(token).digest('hex');
}

export function generateDirectLinkToken(): GeneratedDirectLinkToken {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
  return {
    token,
    prefix: token.slice(0, TOKEN_PREFIX.length + DISPLAY_PREFIX_CHARS),
    tokenHash: hashDirectLinkToken(token),
  };
}

/** A malformed token is rejected before any database lookup. */
export function isWellFormedDirectLinkToken(token: string): boolean {
  return DIRECT_LINK_TOKEN_PATTERN.test(token);
}

/** Hash of a visitor email for the abuse ledger; the address is not kept. */
export function hashClaimEmail(email: string): string {
  // codeql[js/insufficient-password-hash]
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
