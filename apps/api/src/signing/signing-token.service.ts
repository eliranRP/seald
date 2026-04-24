import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Per-signer access token utilities.
 *
 * Wire shape: a 256-bit opaque token encoded as URL-safe base64 (43 chars).
 * The plaintext is embedded once in the invite email (`?t=...`). On receipt,
 * the backend hashes it with SHA-256 and looks up the signer by hash —
 * `envelope_signers.access_token_hash` is what persists. A DB dump therefore
 * leaks no valid signing links.
 *
 * Rationale:
 *   - 256 bits of entropy: unforgeable (~3e76 combinations).
 *   - SHA-256 on a 256-bit random input is safe — no need for a slow KDF,
 *     since brute-force is already computationally intractable at this entropy.
 *   - Constant-time compare for any path that ever does an equality check
 *     (not currently used — the DB lookup is already secure — but exposed
 *     for defence in depth).
 */
@Injectable()
export class SigningTokenService {
  /** Generate a fresh 256-bit URL-safe opaque token. */
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Hex-encoded SHA-256 of the token. Stored in envelope_signers.access_token_hash. */
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /** Constant-time equality for two hex-encoded hashes. */
  equalsHash(aHex: string, bHex: string): boolean {
    if (aHex.length !== bHex.length) return false;
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Cheap structural check for tokens received over the wire. */
  looksLikeToken(value: unknown): value is string {
    return typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]+$/.test(value);
  }
}
