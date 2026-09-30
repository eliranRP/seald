import { decodeJwt } from 'jose';

/**
 * Latest `amr[].timestamp` on an already-verified Supabase access token,
 * in unix seconds. A refresh updates `iat` without a new sign-in, so
 * callers that need a fresh login must use this value, not `iat`.
 * Returns null when the claim is missing or not a number.
 */
export function readAmrSignInAt(authorization: string | undefined): number | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) return null;
  const token = match[1];
  if (!token) return null;
  try {
    const payload = decodeJwt(token);
    return latestAmrTimestamp(payload.amr);
  } catch {
    return null;
  }
}

function latestAmrTimestamp(amr: unknown): number | null {
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

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
