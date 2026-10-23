import { API_KEY_DEFAULT_SCOPES, API_KEY_SCOPES, isApiKeyScope, type ApiKeyScope } from 'shared';

/**
 * OAuth scopes are the API-key vocabulary. A request without `scope`
 * gets the same default as a one-tap key (`envelopes:read`). An unknown
 * scope is `invalid_scope` rather than silently dropped, so a client
 * never believes it holds something it does not.
 */
export function parseScopeParam(
  raw: string | undefined,
): { readonly ok: true; readonly scopes: ApiKeyScope[] } | { readonly ok: false } {
  if (raw === undefined || raw.trim() === '')
    return { ok: true, scopes: [...API_KEY_DEFAULT_SCOPES] };
  const parts = raw.split(' ').filter((s) => s.length > 0);
  if (parts.length === 0 || parts.length > API_KEY_SCOPES.length) return { ok: false };
  const out: ApiKeyScope[] = [];
  for (const p of parts) {
    if (!isApiKeyScope(p)) return { ok: false };
    if (!out.includes(p)) out.push(p);
  }
  // Catalogue order, so the stored value and the consent list are stable.
  return { ok: true, scopes: API_KEY_SCOPES.filter((s) => out.includes(s)) };
}

export function formatScopes(scopes: readonly string[]): string {
  return scopes.join(' ');
}

/** Scopes both sides hold, in catalogue order; unknown strings grant nothing. */
export function intersectScopes(a: readonly string[], b: readonly string[]): ApiKeyScope[] {
  return API_KEY_SCOPES.filter((s) => a.includes(s) && b.includes(s));
}
