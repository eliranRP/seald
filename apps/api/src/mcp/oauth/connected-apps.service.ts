import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ConnectedAppListResponseSchema,
  type ConnectedApp,
  type ConnectedAppListResponse,
  type RevokeConnectedAppResponse,
} from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { ApprovalsLifecycleService } from '../../approvals/approvals-lifecycle.service';
import { clientIdHost } from './connected-app-label';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { intersectScopes } from './oauth-scopes';
import { OAuthRepository, type OAuthGrantRecord } from './oauth.repository';
import { redirectHost } from './redirect-uri';

/**
 * "Connected apps" on the Developers page (docs/design/mcp-server.md
 * § Settings UI, item 8). Supabase session only. Revoke keeps the row
 * (`revoked_at`), kills every token of the grant and expires its pending
 * approvals, the same as revoking a key.
 */
@Injectable()
export class ConnectedAppsService {
  private readonly log = new Logger(ConnectedAppsService.name);

  constructor(
    @Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig,
    private readonly repo: OAuthRepository,
    private readonly lifecycle: ApprovalsLifecycleService,
  ) {}

  async list(user: AuthUser): Promise<ConnectedAppListResponse> {
    const grants = await this.repo.listLiveGrants(user.id);
    return ConnectedAppListResponseSchema.parse({ items: grants.map((g) => this.toApp(g)) });
  }

  revoke(user: AuthUser, id: string, now: Date = new Date()): Promise<RevokeConnectedAppResponse> {
    return this.revokeForOwner(user.id, id, now);
  }

  /** WP-45: the owner's connected apps, for `connected_apps_list`. */
  async listForOwner(ownerId: string): Promise<ConnectedAppListResponse> {
    const grants = await this.repo.listLiveGrants(ownerId);
    return ConnectedAppListResponseSchema.parse({ items: grants.map((g) => this.toApp(g)) });
  }

  /**
   * WP-45: one live grant of the owner as a connected app (its card facts),
   * or null. Another owner's grant reads as none.
   */
  async findLive(ownerId: string, id: string): Promise<ConnectedApp | null> {
    const grant = await this.repo.findGrant(id);
    if (!grant || grant.ownerId !== ownerId || grant.revokedAt !== null) return null;
    return this.toApp(grant);
  }

  /** `POST /me/connected-apps/:id/revoke`, and the approved `oauth_grant_revoke` (WP-45). */
  async revokeForOwner(
    ownerId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<RevokeConnectedAppResponse> {
    const grant = await this.repo.findGrant(id);
    // Another owner's grant reads as none.
    if (!grant || grant.ownerId !== ownerId || grant.revokedAt !== null) {
      throw new NotFoundException('connected_app_not_found');
    }
    await this.repo.revokeGrant(grant.id, 'owner_revoked', now);
    await this.lifecycle.expireForRevokedGrant(grant.id, now);
    this.log.log(`connected app revoked grant=${grant.id} owner=${ownerId}`);
    return { revoked: true };
  }

  private toApp(g: OAuthGrantRecord): ConnectedApp {
    const cimd = g.client.kind === 'cimd';
    return {
      id: g.id,
      client_name: g.client.clientName,
      client_host: cimd
        ? clientIdHost(g.client.clientId)
        : redirectHost(g.client.redirectUris[0] ?? ''),
      unverified: cimd && !this.config.verifiedCimdHosts.has(hostnameOf(g.client.clientId)),
      scopes: intersectScopes(g.scopes, g.scopes),
      created_at: g.createdAt,
      last_used_at: g.lastUsedAt,
    };
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
