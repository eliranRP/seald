import { API_KEY_SEND_FRESH_LOGIN_MS } from 'shared';

/**
 * Latest `amr[].timestamp` on a Supabase access token, in unix seconds.
 * A refresh updates `iat` without a new sign-in, so Send uses this.
 */
export function readAmrSignInAtSeconds(token: string | undefined): number | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded)) as { amr?: unknown };
    return latestAmr(json.amr);
  } catch {
    return null;
  }
}

export function isSendLoginFresh(token: string | undefined, now = Date.now()): boolean {
  const seconds = readAmrSignInAtSeconds(token);
  if (seconds === null) return false;
  return now - seconds * 1000 <= API_KEY_SEND_FRESH_LOGIN_MS;
}

function latestAmr(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') continue;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}
