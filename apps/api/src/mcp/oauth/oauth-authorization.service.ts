import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  MCP_OAUTH_CONSENT_PATH,
  MCP_OAUTH_LIFETIMES,
  OAuthAuthorizationRequestSchema,
  OAuthConsentDecisionSchema,
  requiresFreshLogin,
  type ApiKeyScope,
  type OAuthConsentDescription,
  type OAuthConsentResult,
} from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { isFreshLogin } from '../../api-keys/api-keys.service';
import { OAuthClientResolver, type ResolvedClient } from './oauth-client-resolver';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { formatScopes, parseScopeParam } from './oauth-scopes';
import { mintAuthorizationCode } from './oauth-secrets';
import { OAuthRepository } from './oauth.repository';
import { isValidS256Challenge } from './pkce';
import { matchRedirectUri, redirectHost, withQuery } from './redirect-uri';

/** A request that passed every check. */
export interface ValidAuthorizationRequest {
  readonly client: ResolvedClient;
  readonly redirectUri: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly state: string | undefined;
  readonly codeChallenge: string;
  readonly resource: string;
}

/**
 * Validation outcome, in the RFC 6749 § 4.1.2.1 order: until the client
 * and the redirect URI are trusted, an error is shown by Seald and never
 * sent to the redirect URI (`redirect: false`). After that, errors go
 * back to the client's redirect URI with `state` and `iss`.
 */
export type AuthorizationValidation =
  | { readonly ok: true; readonly request: ValidAuthorizationRequest }
  | { readonly ok: false; readonly redirect: false; readonly error: string }
  | {
      readonly ok: false;
      readonly redirect: true;
      readonly error: string;
      readonly redirectUri: string;
      readonly state: string | undefined;
    };

function single(query: Readonly<Record<string, unknown>>, key: string): string | undefined | null {
  const v = query[key];
  if (v === undefined) return undefined;
  // A repeated parameter is ambiguous (RFC 6749 § 3.1): refuse it.
  return typeof v === 'string' ? v : null;
}

/**
 * The authorization endpoint and the consent decision
 * (docs/design/mcp-server.md § OAuth 2.1, steps 4–6). Authorization code
 * with PKCE S256 only; the resource indicator must be the MCP endpoint.
 * The owner proves who they are with their Supabase session on the
 * consent page; Seald then mints a single-use, 60-second code bound to
 * the owner, the client, the exact redirect URI, the challenge, the
 * resource and the scopes.
 */
@Injectable()
export class OAuthAuthorizationService {
  private readonly log = new Logger(OAuthAuthorizationService.name);

  constructor(
    @Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig,
    private readonly clients: OAuthClientResolver,
    private readonly repo: OAuthRepository,
  ) {}

  async validate(query: Readonly<Record<string, unknown>>): Promise<AuthorizationValidation> {
    const clientId = single(query, 'client_id');
    const redirectUri = single(query, 'redirect_uri');
    if (!clientId || !redirectUri) return { ok: false, redirect: false, error: 'invalid_request' };
    const resolved = await this.clients.resolve(clientId);
    if (!resolved.ok) return { ok: false, redirect: false, error: 'invalid_client' };
    if (!matchRedirectUri(redirectUri, resolved.client.redirectUris)) {
      return { ok: false, redirect: false, error: 'invalid_redirect_uri' };
    }

    const state = single(query, 'state');
    const back = (error: string): AuthorizationValidation => ({
      ok: false,
      redirect: true,
      error,
      redirectUri,
      state: typeof state === 'string' ? state : undefined,
    });
    if (state === null || (typeof state === 'string' && state.length > 1024)) {
      return back('invalid_request');
    }
    const parsed = OAuthAuthorizationRequestSchema.safeParse(stripUnknown(query));
    if (!parsed.success) return back('invalid_request');
    const req = parsed.data;
    if (req.response_type !== 'code') return back('unsupported_response_type');
    if (req.code_challenge_method !== 'S256' || !isValidS256Challenge(req.code_challenge)) {
      return back('invalid_request');
    }
    const scopes = parseScopeParam(req.scope);
    if (!scopes.ok) return back('invalid_scope');
    // RFC 8707: the token is for the MCP endpoint and nothing else.
    if (req.resource !== this.config.resource) return back('invalid_target');

    return {
      ok: true,
      request: {
        client: resolved.client,
        redirectUri,
        scopes: scopes.scopes,
        state: req.state,
        codeChallenge: req.code_challenge,
        resource: req.resource,
      },
    };
  }

  /** `GET /oauth/authorize`: where to send the browser. */
  async authorizeRedirect(query: Readonly<Record<string, unknown>>): Promise<string> {
    const v = await this.validate(query);
    const consent = `${this.config.appPublicUrl}${MCP_OAUTH_CONSENT_PATH}`;
    if (!v.ok && !v.redirect) {
      // Seald's own page explains it; nothing goes to an untrusted URI.
      return withQuery(consent, { error: v.error });
    }
    if (!v.ok) return this.errorRedirect(v.redirectUri, v.error, v.state);
    const r = v.request;
    return withQuery(consent, {
      response_type: 'code',
      client_id: r.client.clientId,
      redirect_uri: r.redirectUri,
      code_challenge: r.codeChallenge,
      code_challenge_method: 'S256',
      scope: formatScopes(r.scopes),
      state: r.state,
      resource: r.resource,
    });
  }

  /** `POST /oauth/consent/describe`: what the consent card shows. */
  async describe(
    user: AuthUser,
    body: unknown,
    now: Date = new Date(),
  ): Promise<OAuthConsentDescription> {
    assertOwner(user);
    const parsed = OAuthAuthorizationRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_request');
    const v = await this.validate(parsed.data);
    if (!v.ok) throw new BadRequestException(v.error);
    const r = v.request;
    return {
      client_name: r.client.clientName,
      redirect_host: redirectHost(r.redirectUri),
      unverified: r.client.unverified,
      scopes: [...r.scopes],
      fresh_login_required:
        requiresFreshLogin(r.scopes) && !isFreshLogin(user.lastSignInAt ?? null, now),
    };
  }

  /**
   * `POST /oauth/consent`: Approve mints the code; Deny sends
   * `access_denied` back. Either way the browser is sent to the client's
   * redirect URI with `state` and `iss` (RFC 9207).
   */
  async decide(user: AuthUser, body: unknown, now: Date = new Date()): Promise<OAuthConsentResult> {
    assertOwner(user);
    const parsed = OAuthConsentDecisionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_request');
    const { decision, ...request } = parsed.data;
    const v = await this.validate(request);
    if (!v.ok) throw new BadRequestException(v.error);
    const r = v.request;
    if (decision === 'deny') {
      this.log.log(`oauth consent denied owner=${user.id} client_host=${r.client.host}`);
      return { redirect_to: this.errorRedirect(r.redirectUri, 'access_denied', r.state) };
    }
    // The same fresh sign-in a key with these scopes needs (WP-14).
    if (requiresFreshLogin(r.scopes) && !isFreshLogin(user.lastSignInAt ?? null, now)) {
      throw new ForbiddenException('fresh_login_required');
    }
    const client = await this.repo.upsertClient({
      clientId: r.client.clientId,
      kind: r.client.kind,
      clientName: r.client.clientName,
      redirectUris: r.client.redirectUris,
      now,
    });
    const grant = await this.repo.upsertGrant({
      ownerId: user.id,
      clientRef: client.id,
      scopes: r.scopes,
      now,
    });
    const code = mintAuthorizationCode();
    await this.repo.insertCode({
      codeHash: code.hash,
      grantId: grant.id,
      ownerId: user.id,
      clientRef: client.id,
      redirectUri: r.redirectUri,
      codeChallenge: r.codeChallenge,
      resource: r.resource,
      scopes: r.scopes,
      expiresAt: new Date(now.getTime() + MCP_OAUTH_LIFETIMES.codeSeconds * 1000).toISOString(),
    });
    this.log.log(
      `oauth consent approved owner=${user.id} grant=${grant.id} client_host=${r.client.host}`,
    );
    return {
      redirect_to: withQuery(r.redirectUri, {
        code: code.token,
        state: r.state,
        iss: this.config.issuer,
      }),
    };
  }

  private errorRedirect(redirectUri: string, error: string, state: string | undefined): string {
    return withQuery(redirectUri, { error, state, iss: this.config.issuer });
  }
}

/** Guests and anonymous sessions have no email, so no account to connect. */
function assertOwner(user: AuthUser): void {
  if (user.email === null) throw new ForbiddenException('email_required');
}

const REQUEST_KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'state',
  'resource',
] as const;

/** Unknown authorization parameters are ignored (RFC 6749 § 3.1). */
function stripUnknown(query: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of REQUEST_KEYS) {
    if (query[k] !== undefined) out[k] = query[k];
  }
  return out;
}
