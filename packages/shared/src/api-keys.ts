/**
 * Agent access keys. The secret is shown once and stored as a SHA-256
 * hash. These constants are the contract shared by the API and the
 * Developers page.
 */

/**
 * Creatable scopes. `envelopes:send` is intentionally absent until step
 * 10. Creating a send-scope key needs a fresh sign-in, and the current
 * re-auth path loops: `/signin` bounces an already signed-in user, so
 * `auth_time` never refreshes. Do not add the scope until that handoff
 * exists. The API rejects the string as an unknown scope.
 */
export const API_KEY_SCOPES = [
  'envelopes:read',
  'envelopes:write',
  'documents:write',
  'contacts:read',
  'contacts:write',
  'templates:read',
  'templates:write',
  'gdrive:read',
  'gdrive:write',
  'automations:read',
  'automations:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** The only scope pre-checked when a key is created with an empty body. */
export const DEFAULT_API_KEY_SCOPES: readonly ApiKeyScope[] = ['envelopes:read'];

export const API_KEY_EXPIRY_DAY_CHOICES = [30, 90, 365] as const;

export type ApiKeyExpiryDays = (typeof API_KEY_EXPIRY_DAY_CHOICES)[number];

export const DEFAULT_API_KEY_EXPIRY_DAYS: ApiKeyExpiryDays = 90;

export const MAX_API_KEY_EXPIRY_DAYS = 365;

export const MAX_LIVE_API_KEYS = 10;

export const API_KEY_TOKEN_PREFIX = 'seald_live_';

const SCOPE_SET: ReadonlySet<string> = new Set(API_KEY_SCOPES);

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return SCOPE_SET.has(value);
}

/** Canonical order, duplicates dropped. Unknown values are omitted. */
export function normalizeApiKeyScopes(values: readonly string[]): ApiKeyScope[] {
  const wanted = new Set(values);
  return API_KEY_SCOPES.filter((scope) => wanted.has(scope));
}
