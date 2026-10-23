import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { ACCESS_CODE_POLICY, type AccessCodePurpose } from 'shared';

/**
 * Pure helpers for the emailed one-time code (WP-10).
 *
 * - The code is 6 digits from the CSPRNG (`randomInt`, no modulo bias).
 * - Only `hashAccessCode` output is stored: hex HMAC-SHA256 keyed with
 *   SIGNER_OTP_KEY (the pepper, held outside the database) over the
 *   challenge id, signer id and purpose (the per-row salt) and the code.
 *   A leaked table alone does not let anyone test the 10^6 candidates,
 *   and one hash cannot be replayed against another signer, purpose or
 *   challenge.
 * - `accessCodeMatches` compares the two digests with `timingSafeEqual`.
 */

export interface AccessCodeBinding {
  readonly challenge_id: string;
  readonly signer_id: string;
  readonly purpose: AccessCodePurpose;
}

/** A fresh zero-padded code, e.g. `"042917"`. */
export function generateAccessCode(): string {
  const max = 10 ** ACCESS_CODE_POLICY.length;
  return randomInt(0, max).toString().padStart(ACCESS_CODE_POLICY.length, '0');
}

/** Hex HMAC-SHA256 of the code bound to its challenge, signer and purpose. */
export function hashAccessCode(key: string, binding: AccessCodeBinding, code: string): string {
  return createHmac('sha256', key)
    .update('seald/signer-otp/v1\n')
    .update(`${binding.challenge_id}\n${binding.signer_id}\n${binding.purpose}\n${code}`)
    .digest('hex');
}

/**
 * Constant-time check of `code` against a stored hex digest. A missing or
 * malformed stored value never matches, and the HMAC is still computed so
 * the timing does not depend on it.
 */
export function accessCodeMatches(
  key: string,
  binding: AccessCodeBinding,
  code: string,
  storedHex: string | null,
): boolean {
  const candidate = Buffer.from(hashAccessCode(key, binding, code), 'hex');
  const stored =
    storedHex !== null && /^[0-9a-f]{64}$/.test(storedHex)
      ? Buffer.from(storedHex, 'hex')
      : Buffer.alloc(candidate.length);
  const equal = timingSafeEqual(candidate, stored);
  return equal && storedHex !== null && stored.length === candidate.length;
}

/** Why a stored challenge can no longer accept a code, or null if it can. */
export type ChallengeState = 'not_requested' | 'expired' | 'locked' | null;

export interface ChallengeLike {
  readonly code_hash: string | null;
  readonly attempts: number;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly locked_at: Date | null;
  readonly superseded_at: Date | null;
}

export function challengeState(c: ChallengeLike | null, now: Date): ChallengeState {
  if (!c || c.code_hash === null || c.consumed_at !== null || c.superseded_at !== null) {
    return 'not_requested';
  }
  if (c.locked_at !== null || c.attempts >= ACCESS_CODE_POLICY.maxAttempts) return 'locked';
  if (c.expires_at.getTime() <= now.getTime()) return 'expired';
  return null;
}

/**
 * Seconds the signer must wait before another send, or 0. `recent` are the
 * creation times of this signer's challenges, any order.
 */
export function sendWaitSeconds(
  recent: ReadonlyArray<Date>,
  now: Date,
): { readonly reason: 'cooldown' | 'rate_limited'; readonly seconds: number } | null {
  const nowMs = now.getTime();
  const hourAgo = nowMs - 3600_000;
  const inHour = recent
    .map((d) => d.getTime())
    .filter((t) => t > hourAgo)
    .sort((a, b) => a - b);
  const newest = inHour[inHour.length - 1];
  if (newest !== undefined) {
    const wait = newest + ACCESS_CODE_POLICY.resendCooldownSeconds * 1000 - nowMs;
    if (wait > 0) return { reason: 'cooldown', seconds: Math.ceil(wait / 1000) };
  }
  if (inHour.length >= ACCESS_CODE_POLICY.maxSendsPerHour) {
    // The oldest send in the window drops out first.
    const oldest = inHour[inHour.length - ACCESS_CODE_POLICY.maxSendsPerHour] ?? nowMs;
    return {
      reason: 'rate_limited',
      seconds: Math.max(1, Math.ceil((oldest + 3600_000 - nowMs) / 1000)),
    };
  }
  return null;
}
