import { createHash, randomBytes } from 'node:crypto';
import { API_KEY_PREFIX, API_KEY_PREFIX_SECRET_CHARS } from 'shared';

/**
 * API key secret format (docs/design/mcp-server.md § API keys, Generation).
 *
 *   seald_live_<body><checksum>
 *
 * - `body` is 32 random bytes (256 bits), base64url: 43 characters.
 * - `checksum` is the first 6 base64url characters of SHA-256 over
 *   `seald_live_<body>`. A truncated or mistyped paste fails the checksum
 *   and is rejected before any database lookup (fails closed).
 * - The "secret" is `<body><checksum>` (49 characters). `prefix` is
 *   `seald_live_` + its first 8 characters. `key_hash` is hex SHA-256 of
 *   the secret. Nothing else about the secret is stored or logged.
 *
 * SHA-256 (not a slow password hash) is deliberate: the secret is 256
 * bits of randomness, so a slow hash would only add latency.
 */

export const SECRET_BODY_BYTES = 32;
const BODY_CHARS = 43;
const CHECKSUM_CHARS = 6;
export const SECRET_CHARS = BODY_CHARS + CHECKSUM_CHARS;

const KEY_PATTERN = new RegExp(
  `^${API_KEY_PREFIX}([A-Za-z0-9_-]{${BODY_CHARS}})([A-Za-z0-9_-]{${CHECKSUM_CHARS}})$`,
);

export interface GeneratedApiKey {
  /** The full display value, `seald_live_…`. Shown once, never stored. */
  readonly token: string;
  readonly prefix: string;
  readonly keyHash: string;
}

export interface ParsedApiKey {
  readonly prefix: string;
  readonly keyHash: string;
}

function checksumOf(body: string): string {
  return createHash('sha256')
    .update(`${API_KEY_PREFIX}${body}`)
    .digest('base64url')
    .slice(0, CHECKSUM_CHARS);
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function prefixOf(secret: string): string {
  return `${API_KEY_PREFIX}${secret.slice(0, API_KEY_PREFIX_SECRET_CHARS)}`;
}

/** Mint a new key. `bytes` is injectable for tests only. */
export function generateApiKey(bytes: Buffer = randomBytes(SECRET_BODY_BYTES)): GeneratedApiKey {
  if (bytes.length !== SECRET_BODY_BYTES) {
    throw new Error(`api key needs ${SECRET_BODY_BYTES} random bytes`);
  }
  const body = bytes.toString('base64url');
  const secret = `${body}${checksumOf(body)}`;
  return {
    token: `${API_KEY_PREFIX}${secret}`,
    prefix: prefixOf(secret),
    keyHash: hashSecret(secret),
  };
}

/**
 * Parse a presented bearer value. Returns null for anything that is not a
 * well-formed key with a valid checksum: wrong literal prefix, wrong
 * length, a character outside base64url, or a bad checksum.
 */
export function parseApiKey(token: string): ParsedApiKey | null {
  const match = KEY_PATTERN.exec(token);
  if (!match) return null;
  const body = match[1] ?? '';
  const checksum = match[2] ?? '';
  if (checksumOf(body) !== checksum) return null;
  const secret = `${body}${checksum}`;
  return { prefix: prefixOf(secret), keyHash: hashSecret(secret) };
}

/** True when the value has the API key's literal prefix (any validity). */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}
