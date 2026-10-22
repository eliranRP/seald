/**
 * Request-time read of the `MCP_DISABLED` kill switch. The env schema
 * validates the value at boot (`"true"`, `"false"`, `"1"`, `"0"`); this
 * reads `process.env` again on each call so an operator can flip it on a
 * running container without a rebuild. Same truthy strings as
 * `strictBooleanString`.
 */
export function mcpDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env['MCP_DISABLED'];
  return value === 'true' || value === '1';
}
