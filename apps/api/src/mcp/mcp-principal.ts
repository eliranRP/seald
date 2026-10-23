import type { ApiKeyPrincipal } from '../api-keys/api-key-auth.service';

/** WP-27: what an OAuth access token adds to the principal. */
export interface McpOAuthCredential {
  /** `oauth_grants.id`. Approvals, suspension and audit rows name it. */
  readonly grantId: string;
  /** `oauth_clients.id` (a uuid, not the client's own `client_id`). */
  readonly clientId: string;
}

/**
 * Who a verified `/mcp` credential acts for. An API key (WP-14) is the
 * base shape. An OAuth access token (WP-27) has the same shape so every
 * tool runs the same scope checks, approval requirements and caps, plus
 * `oauth`: then `keyId` is the grant id (the idempotency and log
 * namespace), `keyName` the connected app's label and `keyPrefix` empty.
 * Code that asks the owner or writes audit rows uses `requesterOf` and
 * never passes `keyId` as an API key id.
 */
export type McpPrincipal = ApiKeyPrincipal & { readonly oauth?: McpOAuthCredential };

/**
 * The approvals requester for a principal: a key (`{ ownerId, apiKeyId }`,
 * the shape it always had), or an OAuth grant (`apiKeyId: null` plus
 * `oauthGrantId`).
 */
export function requesterOf(principal: McpPrincipal): {
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId?: string;
} {
  return principal.oauth
    ? { ownerId: principal.ownerId, apiKeyId: null, oauthGrantId: principal.oauth.grantId }
    : { ownerId: principal.ownerId, apiKeyId: principal.keyId };
}
