import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiKeyAuthService } from '../api-keys/api-key-auth.service';
import { mcpSurfaceEnabled } from './mcp-flag';
import type { McpPrincipal } from './mcp-principal';
import { OAuthAccessTokenService } from './oauth/oauth-access-token.service';
import { MCP_OAUTH_CONFIG, mcpOauthEnabled, type McpOAuthConfig } from './oauth/oauth-config';

/** Where the guard leaves the verified credential for the controller. */
export const MCP_PRINCIPAL = Symbol('mcpPrincipal');

export type McpRequest = Request & { [MCP_PRINCIPAL]?: McpPrincipal };

/**
 * Runs first on every `/mcp` method. A dark surface (`mcpServer` off or
 * `MCP_DISABLED`) is a 404 before auth, like a route that does not exist.
 */
@Injectable()
export class McpFlagGuard implements CanActivate {
  canActivate(): boolean {
    if (!mcpSurfaceEnabled()) throw new NotFoundException('not_found');
    return true;
  }
}

/**
 * The only credential check on `/mcp` (docs/design/mcp-server.md, Auth).
 * The controller is `@Public()` because the global AuthGuard accepts a
 * Supabase JWT only; this guard accepts an API key, through the one
 * verifier `ApiKeyAuthService.verify()` (WP-14), or, while `mcpOauth` is
 * on, an OAuth access token through `OAuthAccessTokenService` (WP-27).
 * A Supabase JWT is neither, so it fails here with 401 too (no token
 * passthrough).
 *
 * 401 is only for a missing, malformed, unknown, revoked or expired
 * credential. Missing scopes are not checked here: a valid credential
 * with too few scopes still reaches the tool layer, which answers
 * `insufficient_scope` as a tool error. With OAuth on, every 401 carries
 * `WWW-Authenticate: Bearer realm="seald", resource_metadata="…"` so a
 * client can discover the authorization server (RFC 9728 § 5.1). With
 * OAuth off the response is exactly what it was before.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeyAuthService,
    private readonly oauth: OAuthAccessTokenService,
    @Inject(MCP_OAUTH_CONFIG) private readonly oauthConfig: McpOAuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<McpRequest>();
    const oauthOn = mcpOauthEnabled();
    const reject = (error: string): never => {
      if (oauthOn) {
        const res = http.getResponse<Response>();
        const metadata = `${this.oauthConfig.issuer}/.well-known/oauth-protected-resource`;
        const detail = error === 'missing_token' ? '' : ', error="invalid_token"';
        res.setHeader(
          'WWW-Authenticate',
          `Bearer realm="seald", resource_metadata="${metadata}"${detail}`,
        );
      }
      throw new UnauthorizedException(error);
    };

    const header = req.headers.authorization;
    const token = ApiKeyAuthService.bearer(header);
    if (header !== undefined && token === null) return reject('invalid_token');

    if (oauthOn && token !== null && OAuthAccessTokenService.looksLikeAccessToken(token)) {
      const verified = await this.oauth.verify(token);
      if (!verified.ok) return reject(verified.error);
      req[MCP_PRINCIPAL] = verified;
      return true;
    }

    const result = await this.keys.verify(token);
    if (!result.ok) return reject(result.error);
    req[MCP_PRINCIPAL] = result;
    return true;
  }
}
