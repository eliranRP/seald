import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_KEY_TOKEN_PREFIX } from 'shared';

/** Base64url of 32 bytes, without padding, is 43 characters. */
const SECRET_BODY_LENGTH = 43;
/** Short checksum so a truncated paste fails before a database lookup. */
const CHECKSUM_HEX_LENGTH = 8;
const SECRET_LENGTH = SECRET_BODY_LENGTH + CHECKSUM_HEX_LENGTH;

export interface GeneratedApiKey {
  /** Full bearer value, `seald_live_` plus the secret. Shown once. */
  readonly token: string;
  /** `seald_live_` plus the first 8 characters of the secret. */
  readonly prefix: string;
  /** Hex SHA-256 of `token`. This is what the database stores. */
  readonly keyHash: string;
}

export interface ParsedApiKey {
  readonly prefix: string;
  readonly keyHash: string;
}

/** Short checksum of the secret body. Not a password hash. */
function checksumOf(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, CHECKSUM_HEX_LENGTH);
}

/**
 * Hex SHA-256 of the full bearer. The secret is 32 bytes from
 * crypto.randomBytes (256 bits), not a password, so a slow password hash
 * would add nothing. A CodeQL "password hash too weak" alert on this
 * SHA-256 is a false positive.
 */
function hashToken(token: string): string {
  // cspell:disable-next-line
  return createHash('sha256').update(token).digest('hex'); // codeql[js/insufficient-password-hash]
}

function checksumMatches(body: string, checksum: string): boolean {
  const expected = Buffer.from(checksumOf(body));
  const got = Buffer.from(checksum);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/**
 * 32 random bytes, base64url, plus a short SHA-256 checksum. The
 * displayed value is `seald_live_<body><checksum>`. The prefix is
 * `seald_live_` plus the first 8 characters of that secret.
 */
export function generateApiKey(): GeneratedApiKey {
  const body = randomBytes(32).toString('base64url');
  const secret = `${body}${checksumOf(body)}`;
  const token = `${API_KEY_TOKEN_PREFIX}${secret}`;
  return {
    token,
    prefix: `${API_KEY_TOKEN_PREFIX}${secret.slice(0, 8)}`,
    keyHash: hashToken(token),
  };
}

/**
 * Reject anything that is not a well-formed `seald_live_` token with a
 * matching checksum. A truncated paste fails here and never reaches
 * the database. Returns the lookup prefix and the hash to compare.
 */
export function parseApiKeyToken(token: string): ParsedApiKey | null {
  if (!token.startsWith(API_KEY_TOKEN_PREFIX)) return null;
  const secret = token.slice(API_KEY_TOKEN_PREFIX.length);
  if (secret.length !== SECRET_LENGTH) return null;
  const body = secret.slice(0, SECRET_BODY_LENGTH);
  const checksum = secret.slice(SECRET_BODY_LENGTH);
  if (!/^[A-Za-z0-9_-]{43}$/.test(body)) return null;
  if (!/^[0-9a-f]{8}$/.test(checksum)) return null;
  if (!checksumMatches(body, checksum)) return null;
  return {
    prefix: `${API_KEY_TOKEN_PREFIX}${secret.slice(0, 8)}`,
    keyHash: hashToken(token),
  };
}

/** Constant-time compare of two hex SHA-256 digests. Length mismatch fails closed. */
export function hashesEqual(storedHex: string, computedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHex) || !/^[0-9a-f]{64}$/.test(computedHex)) return false;
  const stored = Buffer.from(storedHex, 'hex');
  const computed = Buffer.from(computedHex, 'hex');
  if (stored.length !== computed.length) return false;
  return timingSafeEqual(stored, computed);
}

/** Smallest positive N whose `Key N` is not already a live name. */
export function nextKeyName(liveNames: readonly string[]): string {
  const used = new Set(liveNames.map((name) => name.toLowerCase()));
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `Key ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return 'Key';
}
