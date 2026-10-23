import { createHash, randomBytes } from 'node:crypto';
import { MCP_OAUTH_ACCESS_TOKEN_PREFIX, MCP_OAUTH_REFRESH_TOKEN_PREFIX } from 'shared';

/**
 * Opaque OAuth secrets: 32 random bytes, base64url, behind a fixed
 * prefix. Only the hex SHA-256 of the whole value is stored, the same
 * rule as API keys (the secret is 256 bits of randomness, not a
 * password, so a slow hash would only add latency).
 */

const BODY = /^[A-Za-z0-9_-]{43}$/;

export interface MintedSecret {
  readonly token: string;
  readonly hash: string;
}

export function hashSecret(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function mint(prefix: string): MintedSecret {
  const token = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashSecret(token) };
}

export const mintAccessToken = (): MintedSecret => mint(MCP_OAUTH_ACCESS_TOKEN_PREFIX);
export const mintRefreshToken = (): MintedSecret => mint(MCP_OAUTH_REFRESH_TOKEN_PREFIX);
/** Authorization codes have no prefix; they never leave the redirect. */
export const mintAuthorizationCode = (): MintedSecret => mint('');

function shaped(value: unknown, prefix: string): value is string {
  return (
    typeof value === 'string' && value.startsWith(prefix) && BODY.test(value.slice(prefix.length))
  );
}

export const looksLikeAccessToken = (v: unknown): v is string =>
  shaped(v, MCP_OAUTH_ACCESS_TOKEN_PREFIX);
export const looksLikeRefreshToken = (v: unknown): v is string =>
  shaped(v, MCP_OAUTH_REFRESH_TOKEN_PREFIX);
export const looksLikeAuthorizationCode = (v: unknown): v is string => shaped(v, '');
