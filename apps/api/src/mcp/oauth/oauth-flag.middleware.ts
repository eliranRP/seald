import { Injectable, NotFoundException, type NestMiddleware } from '@nestjs/common';
import { mcpOauthEnabled } from './oauth-config';

/**
 * Runs before guards, so with `mcpServer` or `mcpOauth` off (or
 * `MCP_DISABLED` set) every OAuth route is a 404 before the session
 * check, indistinguishable from a route that does not exist.
 */
@Injectable()
export class OAuthFlagMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: (error?: unknown) => void): void {
    if (!mcpOauthEnabled()) throw new NotFoundException('not_found');
    next();
  }
}
