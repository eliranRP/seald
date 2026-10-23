import { z } from 'zod';
import { isoDateTimeOffset } from './iso-datetime';
import { API_KEY_SCOPES } from './api-keys';

/**
 * MCP OAuth 2.1 (docs/design/mcp-server.md § OAuth 2.1, parity plan
 * WP-27, decision D3). Dark behind `mcpServer` and `mcpOauth`.
 *
 * The scopes are the API-key vocabulary (`API_KEY_SCOPES`): a connected
 * app and a key that hold the same scopes can do the same things, and
 * both go through the same owner approval.
 */

/** Opaque access token prefix. The rest is 32 random bytes, base64url. */
export const MCP_OAUTH_ACCESS_TOKEN_PREFIX = 'seald_oat_';

/** Opaque refresh token prefix. */
export const MCP_OAUTH_REFRESH_TOKEN_PREFIX = 'seald_ort_';

/** Lifetimes, in seconds (design doc steps 6–8). */
export const MCP_OAUTH_LIFETIMES = {
  /** Authorization codes: single use. */
  codeSeconds: 60,
  /** Access tokens: about an hour. */
  accessTokenSeconds: 60 * 60,
  /** Refresh tokens: absolute lifetime of a chain from one consent. */
  refreshAbsoluteSeconds: 30 * 24 * 60 * 60,
  /** Refresh tokens: idle lifetime, renewed on each rotation. */
  refreshIdleSeconds: 7 * 24 * 60 * 60,
} as const;

/** Path of the consent page in the SPA (outside AppShell). */
export const MCP_OAUTH_CONSENT_PATH = '/oauth/mcp/consent';

const scopeEnum = z.enum(API_KEY_SCOPES);
const isoDate = isoDateTimeOffset();

/**
 * The authorization request the consent page carries: exactly the query
 * `/oauth/authorize` validated and forwarded. The API re-validates every
 * field on describe and on decide.
 */
export const OAuthAuthorizationRequestSchema = z
  .object({
    response_type: z.string().max(32),
    client_id: z.string().min(1).max(2048),
    redirect_uri: z.string().min(1).max(2048),
    code_challenge: z.string().max(256),
    code_challenge_method: z.string().max(16),
    scope: z.string().max(2048).optional(),
    state: z.string().max(1024).optional(),
    resource: z.string().max(2048).optional(),
  })
  .strict();
export type OAuthAuthorizationRequest = z.infer<typeof OAuthAuthorizationRequestSchema>;

/** `POST /oauth/consent/describe`: what the consent card shows. */
export const OAuthConsentDescriptionSchema = z.object({
  client_name: z.string(),
  /** Host of the redirect URI the code goes back to. */
  redirect_host: z.string(),
  /** True only for a CIMD client that is not on the allow-list. */
  unverified: z.boolean(),
  scopes: z.array(scopeEnum),
  /** True when approving needs a sign-in from the last 10 minutes. */
  fresh_login_required: z.boolean(),
});
export type OAuthConsentDescription = z.infer<typeof OAuthConsentDescriptionSchema>;

/** `POST /oauth/consent`: the request plus the owner's decision. */
export const OAuthConsentDecisionSchema = OAuthAuthorizationRequestSchema.extend({
  decision: z.enum(['approve', 'deny']),
}).strict();
export type OAuthConsentDecision = z.infer<typeof OAuthConsentDecisionSchema>;

/** Where the browser goes next: the client's redirect URI with `code` or `error`. */
export const OAuthConsentResultSchema = z.object({ redirect_to: z.string().url() });
export type OAuthConsentResult = z.infer<typeof OAuthConsentResultSchema>;

/** One row of `GET /me/connected-apps`. Never carries a token or a hash. */
export const ConnectedAppSchema = z.object({
  id: z.guid(),
  client_name: z.string(),
  /** Host of the client id URL (CIMD) or of its first redirect URI. */
  client_host: z.string(),
  unverified: z.boolean(),
  scopes: z.array(scopeEnum),
  created_at: isoDate,
  last_used_at: isoDate.nullable(),
});
export type ConnectedApp = z.infer<typeof ConnectedAppSchema>;

export const ConnectedAppListResponseSchema = z.object({ items: z.array(ConnectedAppSchema) });
export type ConnectedAppListResponse = z.infer<typeof ConnectedAppListResponseSchema>;

export const RevokeConnectedAppResponseSchema = z.object({ revoked: z.literal(true) });
export type RevokeConnectedAppResponse = z.infer<typeof RevokeConnectedAppResponseSchema>;
