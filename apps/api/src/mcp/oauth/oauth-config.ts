import { isFeatureEnabled } from 'shared';
import type { AppEnv } from '../../config/env.schema';
import { apiPublicUrl } from '../../automations/actions/email/email-copy.urls';
import { mcpSurfaceEnabled } from '../mcp-flag';
import {
  parsePreregisteredClients,
  parseVerifiedCimdHosts,
  type PreregisteredClient,
} from './oauth-clients-env';

/**
 * The OAuth surface (authorization server endpoints, the consent API,
 * connected apps, OAuth tokens on `/mcp`) serves only while `mcpServer`
 * and `mcpOauth` are both on and `MCP_DISABLED` is not set. Read per
 * request, like the MCP surface itself.
 */
export function mcpOauthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return mcpSurfaceEnabled(env) && isFeatureEnabled('mcpOauth');
}

export interface McpOAuthConfig {
  /** Authorization server issuer (`iss`), no trailing slash. */
  readonly issuer: string;
  /** The protected resource: the MCP endpoint URL. */
  readonly resource: string;
  /** SPA origin, where the consent page lives. */
  readonly appPublicUrl: string;
  readonly preregistered: ReadonlyMap<string, PreregisteredClient>;
  readonly verifiedCimdHosts: ReadonlySet<string>;
}

export const MCP_OAUTH_CONFIG = Symbol('MCP_OAUTH_CONFIG');

type OAuthEnv = Pick<
  AppEnv,
  'API_PUBLIC_URL' | 'APP_PUBLIC_URL' | 'PORT' | 'MCP_OAUTH_ISSUER' | 'MCP_OAUTH_CLIENTS'
> &
  Partial<Pick<AppEnv, 'MCP_OAUTH_VERIFIED_CIMD_HOSTS'>>;

/**
 * `MCP_OAUTH_ISSUER` wins; otherwise the API's public origin
 * (`apiPublicUrl`, e.g. `https://api.seald.nromomentum.com`). The
 * resource identifier is always `<issuer>/mcp`.
 */
export function buildMcpOAuthConfig(env: OAuthEnv): McpOAuthConfig {
  const issuer = (env.MCP_OAUTH_ISSUER ?? apiPublicUrl(env)).replace(/\/+$/, '');
  return {
    issuer,
    resource: `${issuer}/mcp`,
    appPublicUrl: env.APP_PUBLIC_URL.replace(/\/+$/, ''),
    preregistered: new Map(
      parsePreregisteredClients(env.MCP_OAUTH_CLIENTS).map((c) => [c.clientId, c]),
    ),
    verifiedCimdHosts: new Set(parseVerifiedCimdHosts(env.MCP_OAUTH_VERIFIED_CIMD_HOSTS)),
  };
}
