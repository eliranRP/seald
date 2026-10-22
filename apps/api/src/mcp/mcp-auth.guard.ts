import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyAuthService, type ApiKeyPrincipal } from '../api-keys/api-key-auth.service';
import { mcpSurfaceEnabled } from './mcp-flag';

/** Where the guard leaves the verified credential for the controller. */
export const MCP_PRINCIPAL = Symbol('mcpPrincipal');

export type McpRequest = Request & { [MCP_PRINCIPAL]?: ApiKeyPrincipal };

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
 * verifier `ApiKeyAuthService.verify()` (WP-14). A Supabase JWT is not a
 * key, so it fails here with 401 too (no token passthrough).
 *
 * 401 is only for a missing, malformed, unknown, revoked or expired
 * credential. Missing scopes are not checked here: a valid key with too
 * few scopes still reaches the tool layer, which answers
 * `insufficient_scope` as a tool error.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<McpRequest>();
    const header = req.headers.authorization;
    const token = ApiKeyAuthService.bearer(header);
    if (header !== undefined && token === null) throw new UnauthorizedException('invalid_token');
    const result = await this.keys.verify(token);
    if (!result.ok) throw new UnauthorizedException(result.error);
    req[MCP_PRINCIPAL] = result;
    return true;
  }
}
