import { MCP_OAUTH_CONSENT_PATH, type OAuthAuthorizationRequest } from 'shared';

/**
 * The authorization request the consent page carries. `/oauth/authorize`
 * validated it and forwarded exactly these query parameters; the API
 * validates them again on describe and on decide, so nothing here is
 * trusted.
 */
const KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'state',
  'resource',
] as const;

const REQUIRED = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
] as const;

/** The request, or null when the query does not carry one. */
export function requestFromSearch(search: string): OAuthAuthorizationRequest | null {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value !== null) out[key] = value;
  }
  if (!REQUIRED.every((k) => typeof out[k] === 'string' && out[k] !== '')) return null;
  return out as OAuthAuthorizationRequest;
}

/** `?error=` set by `/oauth/authorize` when the client or redirect is not trusted. */
export function authorizeErrorFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('error');
}

const STASH_KEY = 'seald.consent.pending';
const STASH_MAX_AGE_MS = 10 * 60 * 1000;

/** The request as the query string `/oauth/authorize` forwarded, known keys only. */
function toQuery(req: OAuthAuthorizationRequest): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = req[key];
    if (typeof value === 'string') params.set(key, value);
  }
  return params.toString();
}

/**
 * Sign-in returns to `/oauth/mcp/consent` without the query (the `?next=`
 * validator allows only that exact path), so the request waits in this
 * tab's `sessionStorage` for ten minutes. Storage can be blocked; then the
 * owner starts again from the app.
 *
 * What is stored is the same public query string this tab already had in
 * its address bar and history, limited to the known keys: client_id,
 * redirect_uri, scope, resource, state (the client's own CSRF nonce) and
 * the PKCE challenge (a SHA-256 hash; the verifier never leaves the
 * client). It holds no secret, token, code or Seald session data, and the
 * API validates all of it again on describe and on decide (WP-46,
 * CodeQL js/clear-text-storage reviewed).
 */
export function stashRequest(req: OAuthAuthorizationRequest, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ q: toQuery(req), at: now }));
  } catch {
    /* storage blocked */
  }
}

export function readStashedRequest(now: number = Date.now()): OAuthAuthorizationRequest | null {
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { q?: unknown; at?: unknown };
    const fresh = typeof parsed.at === 'number' && now - parsed.at <= STASH_MAX_AGE_MS;
    const request =
      fresh && typeof parsed.q === 'string' ? requestFromSearch(`?${parsed.q}`) : null;
    // Drop an expired or unreadable entry instead of leaving it behind.
    if (request === null) clearStashedRequest();
    return request;
  } catch {
    clearStashedRequest();
    return null;
  }
}

export function clearStashedRequest(): void {
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    /* storage blocked */
  }
}

export const CONSENT_PATH = MCP_OAUTH_CONSENT_PATH;

/** Plain copy for the errors the API or `/oauth/authorize` can report. */
export function consentErrorCopy(code: string | null | undefined): string {
  switch (code) {
    case 'invalid_client':
      return 'Seald does not know this app. Only approved apps can connect.';
    case 'invalid_redirect_uri':
      return 'This app asked to return somewhere it is not allowed to.';
    case 'invalid_scope':
      return 'This app asked for access Seald does not offer.';
    default:
      return 'This connection request is not valid. Start again from the app.';
  }
}
