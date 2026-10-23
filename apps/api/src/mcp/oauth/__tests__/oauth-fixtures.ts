import { InMemoryApprovalsRepository } from '../../../../test/in-memory-approvals-repository';
import { InMemoryOAuthRepository } from '../../../../test/in-memory-oauth-repository';
import { ApprovalsLifecycleService } from '../../../approvals/approvals-lifecycle.service';
import type { AuthUser } from '../../../auth/auth-user';
import type { AppEnv } from '../../../config/env.schema';
import { CimdFetcher, type PinnedGet } from '../cimd';
import { ConnectedAppsService } from '../connected-apps.service';
import { OAuthAccessTokenService } from '../oauth-access-token.service';
import { OAuthAuthorizationService } from '../oauth-authorization.service';
import { OAuthClientResolver } from '../oauth-client-resolver';
import { buildMcpOAuthConfig, type McpOAuthConfig } from '../oauth-config';
import { s256Challenge } from '../pkce';
import { OAuthTokenService } from '../oauth-token.service';
import type { WebhookResolver } from '../../../automations/ssrf/webhook-target';

export const OWNER = '00000000-0000-4000-8000-0000000000a1';
export const OTHER = '00000000-0000-4000-8000-0000000000b2';
export const ISSUER = 'https://api.seald.test';
export const RESOURCE = `${ISSUER}/mcp`;
export const PRE_CLIENT = 'seald-test-claude';
export const PRE_REDIRECT = 'https://claude.example/api/mcp/auth_callback';
export const CIMD_CLIENT = 'https://agent.example.org/oauth/client.json';
export const CIMD_REDIRECT = 'https://agent.example.org/callback';
// Fake, low-entropy PKCE verifier (43 characters of the unreserved set).
export const VERIFIER = 'v'.repeat(43);
export const CHALLENGE = s256Challenge(VERIFIER);
export const NOW = new Date('2026-10-23T10:00:00.000Z');

export function testEnv(extra: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    APP_PUBLIC_URL: 'https://app.seald.test',
    SUPABASE_URL: 'https://example.supabase.co',
    DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
    CORS_ORIGIN: 'https://app.seald.test',
    MCP_OAUTH_ISSUER: ISSUER,
    MCP_OAUTH_CLIENTS: JSON.stringify([
      { client_id: PRE_CLIENT, client_name: 'Claude', redirect_uris: [PRE_REDIRECT] },
    ]),
    MCP_OAUTH_VERIFIED_CIMD_HOSTS: 'trusted.example.org',
    ...extra,
  } as AppEnv;
}

export function owner(lastSignInAgoSeconds = 30, id = OWNER): AuthUser {
  return {
    id,
    email: 'owner@example.com',
    provider: 'email',
    lastSignInAt: Math.floor(NOW.getTime() / 1000) - lastSignInAgoSeconds,
  };
}

/** A CIMD document server: answers from `docs` by URL; records every fetch. */
export function cimdServer(docs: Record<string, unknown>): {
  readonly http: PinnedGet;
  readonly fetched: string[];
} {
  const fetched: string[] = [];
  const http: PinnedGet = async (opts) => {
    const url = `https://${opts.target.hostname}${opts.target.path}`;
    fetched.push(url);
    const doc = docs[url];
    if (doc === undefined) {
      return { status: 404, contentType: 'text/plain', truncated: false, body: Buffer.from('no') };
    }
    return {
      status: 200,
      contentType: 'application/json',
      truncated: false,
      body: Buffer.from(JSON.stringify(doc)),
    };
  };
  return { http, fetched };
}

export const publicResolver: WebhookResolver = async () => [
  { address: '93.184.216.34', family: 4 },
];

export function cimdDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: CIMD_CLIENT,
    client_name: 'Agent Example',
    redirect_uris: [CIMD_REDIRECT],
    token_endpoint_auth_method: 'none',
    ...over,
  };
}

export interface OAuthWorld {
  readonly env: AppEnv;
  readonly config: McpOAuthConfig;
  readonly repo: InMemoryOAuthRepository;
  readonly approvals: InMemoryApprovalsRepository;
  readonly lifecycle: ApprovalsLifecycleService;
  readonly cimd: CimdFetcher;
  readonly fetched: string[];
  readonly authorization: OAuthAuthorizationService;
  readonly tokens: OAuthTokenService;
  readonly access: OAuthAccessTokenService;
  readonly apps: ConnectedAppsService;
}

export function oauthWorld(
  opts: {
    readonly env?: Partial<AppEnv>;
    readonly docs?: Record<string, unknown>;
    readonly resolver?: WebhookResolver;
  } = {},
): OAuthWorld {
  const env = testEnv(opts.env);
  const config = buildMcpOAuthConfig(env);
  const repo = new InMemoryOAuthRepository();
  const approvals = new InMemoryApprovalsRepository();
  approvals.grantSource = (id) => repo.grantFacts(id);
  const lifecycle = new ApprovalsLifecycleService(approvals);
  const server = cimdServer(opts.docs ?? { [CIMD_CLIENT]: cimdDoc() });
  const cimd = new CimdFetcher(env, opts.resolver ?? publicResolver, undefined, server.http);
  const resolver = new OAuthClientResolver(config, cimd);
  return {
    env,
    config,
    repo,
    approvals,
    lifecycle,
    cimd,
    fetched: server.fetched,
    authorization: new OAuthAuthorizationService(config, resolver, repo),
    tokens: new OAuthTokenService(config, repo, lifecycle),
    access: new OAuthAccessTokenService(config, repo),
    apps: new ConnectedAppsService(config, repo, lifecycle),
  };
}

/** The authorization request a client sends (as query strings). */
export function authRequest(over: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string | undefined> = {
    response_type: 'code',
    client_id: PRE_CLIENT,
    redirect_uri: PRE_REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'envelopes:read envelopes:write',
    state: 'state-123',
    resource: RESOURCE,
    ...over,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) out[k] = v;
  return out;
}

/** Approve on the consent page and return the code from the redirect. */
export async function approveCode(
  w: OAuthWorld,
  over: Record<string, string | undefined> = {},
  user: AuthUser = owner(),
  now: Date = NOW,
): Promise<string> {
  const { redirect_to } = await w.authorization.decide(
    user,
    { ...authRequest(over), decision: 'approve' },
    now,
  );
  const code = new URL(redirect_to).searchParams.get('code');
  if (!code) throw new Error(`no code in ${redirect_to}`);
  return code;
}

export function exchange(
  w: OAuthWorld,
  code: string,
  over: Record<string, string | undefined> = {},
  now: Date = NOW,
) {
  const params: Record<string, string | undefined> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: PRE_REDIRECT,
    client_id: PRE_CLIENT,
    code_verifier: VERIFIER,
    resource: RESOURCE,
    ...over,
  };
  return w.tokens.token(stripUndefined(params), now);
}

export function refresh(
  w: OAuthWorld,
  token: string,
  over: Record<string, string | undefined> = {},
  now: Date = NOW,
) {
  const params: Record<string, string | undefined> = {
    grant_type: 'refresh_token',
    refresh_token: token,
    client_id: PRE_CLIENT,
    ...over,
  };
  return w.tokens.token(stripUndefined(params), now);
}

function stripUndefined(p: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = v;
  return out;
}
