import { createHash } from 'node:crypto';

/**
 * The one SHA-256 fingerprint helper for the API.
 *
 * Used only for inputs that are NOT human-chosen passwords:
 * - API key secrets and MCP OAuth tokens/codes: 256 bits from
 *   `randomBytes(32)`. Brute force is infeasible, so a slow KDF
 *   (argon2/scrypt/bcrypt) adds no resistance and would put KDF cost on
 *   every authenticated request. The stored hash is looked up by equality,
 *   which a salted KDF cannot support.
 * - Idempotency request fingerprints and approval `subject_hash`:
 *   canonical JSON of request/approval facts, compared for equality.
 *
 * Seald stores no user passwords; Supabase Auth owns them. If one is ever
 * handled here, use argon2id/scrypt, never this helper.
 *
 * CodeQL `js/insufficient-password-hash` flags this as a password hash
 * because of names like `secret`/`key` upstream. That is a false positive
 * for the reasons above. The output format is pinned by tests: changing it
 * would invalidate every stored API key and OAuth token hash.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Same digest as {@link sha256Hex}, base64url-encoded (API key checksum). */
export function sha256Base64url(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('base64url');
}
