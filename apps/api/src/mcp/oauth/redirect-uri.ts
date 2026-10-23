/**
 * Redirect URI rules (docs/design/mcp-server.md § OAuth 2.1):
 *
 * - A registered URI is `https`, or a loopback URI under RFC 8252
 *   (`http://127.0.0.1` or `http://[::1]`, any port). Never a fragment,
 *   never userinfo. `localhost` is not loopback here: it can resolve
 *   elsewhere (RFC 8252 § 8.3).
 * - Matching is an exact string comparison against one registered URI.
 *   The only exception is a loopback URI, where the port is ignored and
 *   scheme, host, path and query must still be equal, because native
 *   clients pick a free port at run time.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);

function parse(uri: string): URL | null {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 2048) return null;
  // Whitespace and control characters are rejected, never trimmed.
  for (let i = 0; i < uri.length; i += 1) {
    const c = uri.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return null;
  }
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

export function isLoopbackRedirect(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/** A URI that may be registered (pre-registered list or a CIMD document). */
export function isAllowedRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url) return false;
  if (url.hash !== '' || uri.includes('#')) return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.protocol === 'https:') return url.hostname.length > 0;
  return isLoopbackRedirect(url);
}

/**
 * True when `presented` is exactly one of `registered` (loopback: any
 * port). Both sides must be allowed URIs.
 */
export function matchRedirectUri(presented: string, registered: readonly string[]): boolean {
  if (!isAllowedRedirectUri(presented)) return false;
  for (const candidate of registered) {
    if (!isAllowedRedirectUri(candidate)) continue;
    if (candidate === presented) return true;
    const a = parse(presented);
    const b = parse(candidate);
    if (!a || !b || !isLoopbackRedirect(a) || !isLoopbackRedirect(b)) continue;
    if (
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search &&
      // The raw strings must agree apart from the port.
      stripPort(presented) === stripPort(candidate)
    ) {
      return true;
    }
  }
  return false;
}

/** `http://127.0.0.1:1234/cb` → `http://127.0.0.1/cb`; only for loopback URIs. */
function stripPort(uri: string): string {
  return uri.replace(/^(http:\/\/(?:127\.0\.0\.1|\[::1\])):\d{1,5}(?=[/?]|$)/, '$1');
}

/** The host shown on the consent page ("the code goes back to …"). */
export function redirectHost(uri: string): string {
  const url = parse(uri);
  return url ? url.host : '';
}

/** `redirect_uri` with OAuth response parameters appended (never in a fragment). */
export function withQuery(
  uri: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.append(k, v);
  }
  return url.toString();
}
