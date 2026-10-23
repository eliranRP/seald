/**
 * Validator for the `?next=` return path that sign-in honours. The guided
 * approval review sends an unauthenticated owner to `/signin?next=…`, and
 * after sign-in the app returns them to that path. Only the approval
 * review is a legitimate target, so anything else is refused.
 *
 * Accepted: `/approve/<id>` and `/approve/<id>/review`, with an optional
 * query string made of `[A-Za-z0-9_=&-]` (for example `?page=1`), and the
 * exact path `/oauth/mcp/consent` (WP-27, no query).
 *
 * Refused, and so `null`: absolute and protocol-relative URLs
 * (`https://…`, `//evil.com`), backslash tricks (`/\evil.com`), any other
 * path, fragments, empty or dot segments, whitespace and control
 * characters, and any leftover percent escape. A percent escape can only
 * remain after double encoding, because `URLSearchParams` has already
 * decoded the value once. Refusing it stops a second decode from turning a
 * refused path into an accepted one.
 *
 * The target is also opened with the in-app router, never `window.location`,
 * so even a value that slipped through stays inside the single-page app.
 */
export const NEXT_PARAM = 'next';

const APPROVE_PREFIX = '/approve/';
/**
 * WP-27: the MCP OAuth consent page, exactly, with no query. Its
 * authorization request waits in sessionStorage during sign-in instead,
 * so the long, percent-encoded query never has to pass this validator.
 */
const OAUTH_CONSENT_PATH = '/oauth/mcp/consent';
const MAX_NEXT_LENGTH = 512;
const PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const QUERY_STRING = /^[A-Za-z0-9_=&-]+$/;

/**
 * Returns `candidate` unchanged when it is a safe `/approve/…` path, or
 * `null` when it is not. `candidate` is the value after one URL decode.
 */
export function validateNextPath(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  if (candidate.length === 0 || candidate.length > MAX_NEXT_LENGTH) return null;
  if (candidate.includes('%')) return null;
  if (candidate === OAUTH_CONSENT_PATH) return candidate;
  if (!candidate.startsWith(APPROVE_PREFIX)) return null;

  const queryAt = candidate.indexOf('?');
  const pathPart = queryAt === -1 ? candidate : candidate.slice(0, queryAt);
  const queryPart = queryAt === -1 ? null : candidate.slice(queryAt + 1);

  const segments = pathPart.slice(APPROVE_PREFIX.length).split('/');
  if (!segments.every((segment) => PATH_SEGMENT.test(segment))) return null;
  if (queryPart !== null && !QUERY_STRING.test(queryPart)) return null;

  return candidate;
}

/** Reads and validates `?next=` from a search-params object. */
export function readNextParam(params: URLSearchParams): string | null {
  return validateNextPath(params.get(NEXT_PARAM));
}

/** `path?next=<next>` when `next` is a valid approval path, else `path`. */
export function pathWithNext(path: string, next: string | null): string {
  return next === null ? path : `${path}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}

/**
 * Sign-in with Google and the sign-up confirmation email both leave the app
 * and come back through `/auth/callback`, which has no `?next=`. The page
 * that holds a valid `?next=` parks it here first, and the callback takes it
 * once. It lives in `sessionStorage` (this tab only) for at most an hour, and
 * the value is re-validated when it is taken, so a tampered entry cannot
 * redirect anywhere the validator would refuse.
 */
const REMEMBER_KEY = 'seald.auth.next';
const REMEMBER_MAX_AGE_MS = 60 * 60 * 1000;

export function rememberNext(next: string | null, now: number = Date.now()): void {
  if (next === null) return;
  try {
    window.sessionStorage.setItem(REMEMBER_KEY, JSON.stringify({ next, at: now }));
  } catch {
    /* storage blocked: the sign-in then lands on the default page */
  }
}

/** Returns the parked path once, or `null` when none, expired or invalid. */
export function takeRememberedNext(now: number = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(REMEMBER_KEY);
    window.sessionStorage.removeItem(REMEMBER_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { next, at } = parsed as { next?: unknown; at?: unknown };
    if (typeof next !== 'string' || typeof at !== 'number') return null;
    if (now - at > REMEMBER_MAX_AGE_MS) return null;
    return validateNextPath(next);
  } catch {
    return null;
  }
}
