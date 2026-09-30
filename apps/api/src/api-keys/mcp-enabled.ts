import { isFeatureEnabled } from 'shared';

/**
 * Keys and `/mcp` stay dark unless `mcpServer` is on. `MCP_DISABLED=true`
 * is checked on each request so an incident does not need a rebuild.
 */
export function isMcpSurfaceEnabled(): boolean {
  if (process.env.MCP_DISABLED === 'true') return false;
  return isFeatureEnabled('mcpServer');
}
