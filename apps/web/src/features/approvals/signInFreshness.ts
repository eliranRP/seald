import type { Session } from '@supabase/supabase-js';
import { APPROVAL_POLICY } from 'shared';

/** Newest `amr[].timestamp` (seconds) in a Supabase access token, or null. */
export function lastSignInFromToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { amr?: unknown };
    if (!Array.isArray(payload.amr)) return null;
    let newest: number | null = null;
    for (const entry of payload.amr) {
      const ts = (entry as { timestamp?: unknown } | null)?.timestamp;
      if (
        typeof ts === 'number' &&
        Number.isFinite(ts) &&
        ts > 0 &&
        (newest === null || ts > newest)
      )
        newest = ts;
    }
    return newest;
  } catch {
    return null;
  }
}

/**
 * True when an in-app Approve would get `fresh_login_required`: no
 * session, or the last real sign-in is older than the approval window.
 * Mirrors the server's `isFreshForApproval`.
 */
export function needsSignInToApprove(session: Session | null, now: number = Date.now()): boolean {
  if (!session) return true;
  const last = lastSignInFromToken(session.access_token);
  if (last === null) return true;
  return now / 1000 - last > APPROVAL_POLICY.freshSignInSeconds;
}
