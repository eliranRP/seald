import { z } from 'zod';

/**
 * API keys (docs/design/mcp-server.md § API keys, parity plan WP-14).
 *
 * One key works on `/mcp` and on the public REST API `/api/v1` (parity
 * plan D1). Key management itself stays on the Supabase session
 * (`/me/api-keys`); a key can never call those routes.
 */

/** Literal prefix on every displayed key: `seald_live_<secret>`. */
export const API_KEY_PREFIX = 'seald_live_';

/** Characters of the secret copied into the stored, displayed `prefix`. */
export const API_KEY_PREFIX_SECRET_CHARS = 8;

/** Live (not revoked) keys an owner may hold at once. */
export const API_KEY_MAX_LIVE = 10;

/** `POST {}` expiry. */
export const API_KEY_DEFAULT_TTL_DAYS = 90;

/** Longest expiry the API accepts. A null expiry ("never") is rejected. */
export const API_KEY_MAX_TTL_DAYS = 365;

/** Expiry choices the Developers page offers. 90 is pre-selected. */
export const API_KEY_TTL_CHOICES_DAYS = [30, 90, 365] as const;

/** Longest key name, matching the table's check constraint. */
export const API_KEY_NAME_MAX = 80;

/**
 * Every scope a key can carry. `account:admin`, `keys:admin` and
 * `envelopes:sign` (parity plan D5 / WP-45) exist for the approval-gated
 * tools; like every scope except `envelopes:read`, they are never
 * pre-checked on the Developers page.
 */
export const API_KEY_SCOPES = [
  'envelopes:read',
  'envelopes:write',
  'documents:write',
  'envelopes:send',
  'contacts:read',
  'contacts:write',
  'templates:read',
  'templates:write',
  'gdrive:read',
  'gdrive:write',
  'automations:read',
  'automations:write',
  'account:admin',
  'keys:admin',
  'envelopes:sign',
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Scopes a `POST {}` key gets, and the only pre-checked box in the UI. */
export const API_KEY_DEFAULT_SCOPES: readonly ApiKeyScope[] = ['envelopes:read'];

/**
 * Scopes that need a fresh sign-in to mint. The doc requires it for
 * `envelopes:send`; the WP-45 admin and sign scopes are at least as
 * dangerous, so they need it too.
 */
export const API_KEY_FRESH_LOGIN_SCOPES: readonly ApiKeyScope[] = [
  'envelopes:send',
  'account:admin',
  'keys:admin',
  'envelopes:sign',
];

/**
 * A fresh sign-in is the newest JWT `amr[].timestamp` within this many
 * seconds. `iat` is not used: a refreshed access token gets a new `iat`
 * without a new sign-in.
 */
export const API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS = 10 * 60;

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value);
}

export function requiresFreshLogin(scopes: readonly string[]): boolean {
  return scopes.some((s) => (API_KEY_FRESH_LOGIN_SCOPES as readonly string[]).includes(s));
}

/** Display status: Expired is a key past `expires_at`. */
export const API_KEY_STATUSES = ['active', 'expired', 'revoked'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

const isoDate = z.string().datetime({ offset: true });

/** One row of `GET /me/api-keys`. Never carries the secret or its hash. */
export const ApiKeySchema = z.object({
  id: z.guid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  status: z.enum(API_KEY_STATUSES),
  require_owner_approval: z.boolean(),
  allow_new_recipients: z.boolean(),
  always_require_signin: z.boolean(),
  created_at: isoDate,
  last_used_at: isoDate.nullable(),
  /** Always set by the API. A null here (a hand-made row) reads as Expired. */
  expires_at: isoDate.nullable(),
  revoked_at: isoDate.nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const ApiKeyListResponseSchema = z.object({ items: z.array(ApiKeySchema) });
export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponseSchema>;

/**
 * `POST /me/api-keys`. `{}` creates `Key N`, scope `envelopes:read`,
 * expiry 90 days. `expires_at` is optional; when sent it must be a date
 * in the future and no more than 365 days out, and null is rejected.
 */
export const CreateApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(API_KEY_NAME_MAX).optional(),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
    expires_at: isoDate.optional(),
    always_require_signin: z.boolean().optional(),
  })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

/** The create response is the only place the full `secret` ever appears. */
export const CreateApiKeyResponseSchema = z.object({
  key: ApiKeySchema,
  secret: z.string().startsWith(API_KEY_PREFIX),
});
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

export const RevokeApiKeyResponseSchema = z.object({ revoked: z.literal(true) });
export type RevokeApiKeyResponse = z.infer<typeof RevokeApiKeyResponseSchema>;
