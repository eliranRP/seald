import { Inject, Injectable, Logger } from '@nestjs/common';
import { MCP_OAUTH_LIFETIMES } from 'shared';
import { ApprovalsLifecycleService } from '../../approvals/approvals-lifecycle.service';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { formatScopes, intersectScopes, parseScopeParam } from './oauth-scopes';
import {
  hashSecret,
  looksLikeAccessToken,
  looksLikeAuthorizationCode,
  looksLikeRefreshToken,
  mintAccessToken,
  mintRefreshToken,
} from './oauth-secrets';
import {
  OAuthRepository,
  type OAuthGrantRecord,
  type OAuthRefreshRecord,
} from './oauth.repository';
import { verifyS256 } from './pkce';

/** RFC 6749 § 5.1 success body. */
export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
}

/** RFC 6749 § 5.2 error codes this endpoint returns (plus RFC 8707 `invalid_target`). */
export type TokenErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target';

export class TokenError extends Error {
  constructor(readonly code: TokenErrorCode) {
    super(code);
    this.name = 'TokenError';
  }
}

type Params = Readonly<Record<string, unknown>>;

function str(params: Params, key: string): string | undefined {
  const v = params[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new TokenError('invalid_request');
  return v;
}

function required(params: Params, key: string): string {
  const v = str(params, key);
  if (v === undefined || v === '') throw new TokenError('invalid_request');
  return v;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * The token and revocation endpoints (docs/design/mcp-server.md § OAuth
 * 2.1, steps 7–8). Public clients: `client_id` identifies the client,
 * PKCE proves it is the one that started the flow.
 *
 * - Code exchange checks the verifier (S256), `client_id`, the exact
 *   redirect URI and the resource indicator. A code is single use; its
 *   second use revokes the tokens it produced (OAuth 2.1 § 4.1.3).
 * - Access tokens are opaque and live an hour. Refresh tokens rotate on
 *   every use, expire 30 days after the consent (absolute) or 7 days
 *   after their last use (idle). Replaying an already-rotated refresh
 *   token revokes the whole grant, and with it its pending approvals.
 * - Only SHA-256 hashes of codes and tokens are stored.
 */
@Injectable()
export class OAuthTokenService {
  private readonly log = new Logger(OAuthTokenService.name);

  constructor(
    @Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig,
    private readonly repo: OAuthRepository,
    private readonly lifecycle: ApprovalsLifecycleService,
  ) {}

  async token(params: Params, now: Date = new Date()): Promise<TokenResponse> {
    const grantType = str(params, 'grant_type');
    if (grantType === 'authorization_code') return this.exchangeCode(params, now);
    if (grantType === 'refresh_token') return this.refresh(params, now);
    if (grantType === undefined) throw new TokenError('invalid_request');
    throw new TokenError('unsupported_grant_type');
  }

  private async exchangeCode(params: Params, now: Date): Promise<TokenResponse> {
    const code = required(params, 'code');
    const redirectUri = required(params, 'redirect_uri');
    const clientId = required(params, 'client_id');
    const verifier = required(params, 'code_verifier');
    const resource = required(params, 'resource');
    if (!looksLikeAuthorizationCode(code)) throw new TokenError('invalid_grant');

    const consumed = await this.repo.consumeCode(hashSecret(code), now);
    if (consumed.outcome === 'replayed') {
      // A code used twice was intercepted or replayed: kill what it made.
      const n = await this.repo.revokeFamily(consumed.code.id, now);
      this.log.warn(`oauth code replay grant=${consumed.code.grantId} revoked=${n}`);
      throw new TokenError('invalid_grant');
    }
    if (consumed.outcome === 'invalid') throw new TokenError('invalid_grant');
    const c = consumed.code;

    const grant = await this.repo.findGrant(c.grantId);
    if (!grant || grant.revokedAt !== null || grant.ownerId !== c.ownerId) {
      throw new TokenError('invalid_grant');
    }
    if (grant.client.clientId !== clientId || grant.client.id !== c.clientRef) {
      throw new TokenError('invalid_grant');
    }
    if (redirectUri !== c.redirectUri) throw new TokenError('invalid_grant');
    if (!verifyS256(verifier, c.codeChallenge)) throw new TokenError('invalid_grant');
    if (resource !== c.resource || resource !== this.config.resource) {
      throw new TokenError('invalid_target');
    }

    const scopes = intersectScopes(c.scopes, grant.scopes);
    const nowMs = now.getTime();
    const absolute = nowMs + MCP_OAUTH_LIFETIMES.refreshAbsoluteSeconds * 1000;
    return this.issue(
      grant,
      {
        familyId: c.id,
        scopes,
        resource,
        absoluteMs: absolute,
      },
      now,
      (input) => this.repo.issueTokens(input),
    );
  }

  private async refresh(params: Params, now: Date): Promise<TokenResponse> {
    const token = required(params, 'refresh_token');
    const clientId = required(params, 'client_id');
    const resource = str(params, 'resource');
    const scopeParam = str(params, 'scope');
    if (!looksLikeRefreshToken(token)) throw new TokenError('invalid_grant');
    if (resource !== undefined && resource !== this.config.resource) {
      throw new TokenError('invalid_target');
    }

    const row = await this.repo.findRefreshToken(hashSecret(token));
    if (!row) throw new TokenError('invalid_grant');
    const grant = await this.repo.findGrant(row.grantId);
    if (!grant || grant.client.id !== row.clientRef) throw new TokenError('invalid_grant');
    // Refresh tokens are bound to the client they were issued to.
    if (grant.client.clientId !== clientId) throw new TokenError('invalid_grant');
    if (grant.revokedAt !== null || row.revokedAt !== null) throw new TokenError('invalid_grant');
    if (row.rotatedAt !== null) {
      await this.reuseDetected(grant, now);
      throw new TokenError('invalid_grant');
    }
    const nowMs = now.getTime();
    if (Date.parse(row.absoluteExpiresAt) <= nowMs || Date.parse(row.idleExpiresAt) <= nowMs) {
      throw new TokenError('invalid_grant');
    }

    let scopes = intersectScopes(row.scopes, grant.scopes);
    if (scopeParam !== undefined) {
      const asked = parseScopeParam(scopeParam);
      // A refresh may narrow, never widen (RFC 6749 § 6).
      if (!asked.ok || !asked.scopes.every((s) => row.scopes.includes(s))) {
        throw new TokenError('invalid_scope');
      }
      scopes = intersectScopes(asked.scopes, grant.scopes);
    }

    return this.issue(
      grant,
      {
        familyId: row.familyId,
        scopes,
        resource: row.resource,
        absoluteMs: Date.parse(row.absoluteExpiresAt),
      },
      now,
      async (input) => {
        const outcome = await this.repo.rotateRefreshToken(row.id, input, now);
        if (outcome === 'reused') {
          // Lost the race to another use of the same token: that is reuse too.
          await this.reuseDetected(grant, now);
          throw new TokenError('invalid_grant');
        }
      },
    );
  }

  private async issue(
    grant: OAuthGrantRecord,
    chain: {
      readonly familyId: string;
      readonly scopes: readonly string[];
      readonly resource: string;
      readonly absoluteMs: number;
    },
    now: Date,
    write: (input: Parameters<OAuthRepository['issueTokens']>[0]) => Promise<void>,
  ): Promise<TokenResponse> {
    const nowMs = now.getTime();
    const access = mintAccessToken();
    const refresh = mintRefreshToken();
    const idle = Math.min(nowMs + MCP_OAUTH_LIFETIMES.refreshIdleSeconds * 1000, chain.absoluteMs);
    await write({
      grantId: grant.id,
      familyId: chain.familyId,
      clientRef: grant.client.id,
      scopes: chain.scopes,
      resource: chain.resource,
      accessHash: access.hash,
      accessExpiresAt: iso(nowMs + MCP_OAUTH_LIFETIMES.accessTokenSeconds * 1000),
      refreshHash: refresh.hash,
      refreshAbsoluteExpiresAt: iso(chain.absoluteMs),
      refreshIdleExpiresAt: iso(idle),
    });
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: MCP_OAUTH_LIFETIMES.accessTokenSeconds,
      refresh_token: refresh.token,
      scope: formatScopes(chain.scopes),
    };
  }

  private async reuseDetected(grant: OAuthGrantRecord, now: Date): Promise<void> {
    const revoked = await this.repo.revokeGrant(grant.id, 'refresh_token_reuse', now);
    if (revoked) await this.lifecycle.expireForRevokedGrant(grant.id, now);
    this.log.warn(
      `oauth refresh token reuse: grant revoked grant=${grant.id} owner=${grant.ownerId}`,
    );
  }

  /**
   * RFC 7009. Always succeeds from the caller's point of view: an unknown
   * token, or one issued to another client, changes nothing. A refresh
   * token revokes its whole chain; an access token only itself.
   */
  async revoke(params: Params, now: Date = new Date()): Promise<void> {
    const token = str(params, 'token');
    const clientId = str(params, 'client_id');
    if (token === undefined || token === '') throw new TokenError('invalid_request');
    if (looksLikeRefreshToken(token)) {
      const row = await this.repo.findRefreshToken(hashSecret(token));
      if (!row || !(await this.sameClient(row, clientId))) return;
      await this.repo.revokeFamily(row.familyId, now);
      return;
    }
    if (looksLikeAccessToken(token)) {
      const row = await this.repo.findAccessToken(hashSecret(token));
      if (!row) return;
      if (clientId !== undefined && row.grant.client.clientId !== clientId) return;
      await this.repo.revokeAccessToken(hashSecret(token), now);
    }
  }

  private async sameClient(
    row: OAuthRefreshRecord,
    clientId: string | undefined,
  ): Promise<boolean> {
    if (clientId === undefined) return true;
    const grant = await this.repo.findGrant(row.grantId);
    return grant !== null && grant.client.clientId === clientId;
  }
}
