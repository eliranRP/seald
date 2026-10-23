import { Inject, Injectable, Logger } from '@nestjs/common';
import type { McpPrincipal } from '../mcp-principal';
import { connectedAppLabel } from './connected-app-label';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { intersectScopes } from './oauth-scopes';
import { hashSecret, looksLikeAccessToken } from './oauth-secrets';
import { OAuthRepository } from './oauth.repository';

export type OAuthAccessVerifyResult =
  | (McpPrincipal & { readonly ok: true })
  | { readonly ok: false; readonly error: 'invalid_token' };

const TOUCH_INTERVAL_MS = 60_000;

/**
 * Verifies an OAuth access token presented on `/mcp` (WP-27). Every
 * failure is `invalid_token` (RFC 6750 § 3.1): unknown, expired,
 * revoked, a revoked grant, or a token minted for another resource.
 *
 * The principal has the API-key shape so every tool runs the same scope
 * checks, approval requirements and caps. Scopes are the token's scopes
 * intersected with the grant's current scopes. `require_owner_approval`
 * is always true for a connected app: the unattended opt-out is a key
 * setting only (docs/design/mcp-server.md § API keys), and no surface
 * sets it on a grant.
 */
@Injectable()
export class OAuthAccessTokenService {
  private readonly log = new Logger(OAuthAccessTokenService.name);

  constructor(
    @Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig,
    private readonly repo: OAuthRepository,
  ) {}

  static looksLikeAccessToken(token: string | null): boolean {
    return looksLikeAccessToken(token);
  }

  async verify(token: string, now: Date = new Date()): Promise<OAuthAccessVerifyResult> {
    if (!looksLikeAccessToken(token)) return { ok: false, error: 'invalid_token' };
    const row = await this.repo.findAccessToken(hashSecret(token));
    if (!row) return { ok: false, error: 'invalid_token' };
    const grant = row.grant;
    if (row.revokedAt !== null || grant.revokedAt !== null)
      return { ok: false, error: 'invalid_token' };
    if (Date.parse(row.expiresAt) <= now.getTime()) return { ok: false, error: 'invalid_token' };
    if (row.resource !== this.config.resource) return { ok: false, error: 'invalid_token' };

    if (
      grant.lastUsedAt === null ||
      now.getTime() - Date.parse(grant.lastUsedAt) >= TOUCH_INTERVAL_MS
    ) {
      try {
        await this.repo.touchGrantLastUsed(grant.id, now);
      } catch (err) {
        this.log.warn(
          `oauth last_used_at update failed grant=${grant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      ok: true,
      ownerId: grant.ownerId,
      keyId: grant.id,
      scopes: intersectScopes(row.scopes, grant.scopes),
      keyName: connectedAppLabel(grant.client.kind, grant.client.clientId, grant.client.clientName),
      keyPrefix: '',
      requireOwnerApproval: true,
      allowNewRecipients: grant.allowNewRecipients,
      alwaysRequireSignin: grant.alwaysRequireSignin,
      oauth: { grantId: grant.id, clientId: grant.client.id },
    };
  }
}
