import { Injectable, NotFoundException, type NestMiddleware } from '@nestjs/common';
import { isFeatureEnabled } from 'shared';

/**
 * API keys serve `/mcp` (`mcpServer`) and `/api/v1` (`publicApi`, parity
 * plan D1). Key management is on when either surface is. `MCP_DISABLED`
 * is the incident switch for the MCP surface only and is read per request
 * so flipping it needs no rebuild.
 */
export function apiKeysEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const mcpOn = isFeatureEnabled('mcpServer') && env['MCP_DISABLED'] !== 'true';
  return mcpOn || isFeatureEnabled('publicApi');
}

/**
 * Runs before guards, so a dark feature 404s before the session check
 * and is indistinguishable from a route that does not exist.
 */
@Injectable()
export class ApiKeysFlagMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: (error?: unknown) => void): void {
    if (!apiKeysEnabled()) throw new NotFoundException('not_found');
    next();
  }
}
