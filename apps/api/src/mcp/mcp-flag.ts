import { isFeatureEnabled } from 'shared';
import { mcpDisabled } from '../config/mcp-disabled';

/**
 * `/mcp` serves only while the `mcpServer` flag is on and the
 * `MCP_DISABLED` kill switch is not set. Both are read per request.
 */
export function mcpSurfaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isFeatureEnabled('mcpServer') && !mcpDisabled(env);
}
