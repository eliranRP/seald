import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import {
  pinnedGet,
  type PinnedGetOptions,
  type PinnedGetResult,
} from '../../automations/ssrf/pinned-request';
import {
  defaultResolver,
  effectiveAllowance,
  resolveWebhookTarget,
  sealdOwnHosts,
  type WebhookResolver,
  type WebhookTestAllowance,
} from '../../automations/ssrf/webhook-target';
import { isAllowedRedirectUri } from './redirect-uri';

/**
 * Client ID Metadata Documents (CIMD, draft-ietf-oauth-client-id-metadata-document):
 * a client whose `client_id` is an `https` URL publishes its metadata at
 * that URL, and the authorization server fetches it. This replaces open
 * dynamic registration (docs/design/mcp-server.md § OAuth 2.1).
 *
 * The fetch goes through the automations SSRF path
 * (`automations/ssrf/**`): static URL checks, one DNS resolution, every
 * answer checked against the address policy (private, loopback,
 * link-local, metadata ranges blocked), then a GET to the pinned address
 * with no redirects, a 3-second connect and 5-second total timeout and a
 * 5 KB body cap. Results are cached (10 minutes; failures 1 minute).
 */

export const CIMD_RESOLVER = Symbol('CIMD_RESOLVER');
export const CIMD_TEST_ALLOWANCE = Symbol('CIMD_TEST_ALLOWANCE');
export const CIMD_HTTP_CLIENT = Symbol('CIMD_HTTP_CLIENT');

export type PinnedGet = (opts: PinnedGetOptions) => Promise<PinnedGetResult>;

export const CIMD_LIMITS = {
  maxBytes: 5 * 1024,
  connectTimeoutMs: 3_000,
  totalTimeoutMs: 5_000,
  cacheTtlMs: 10 * 60_000,
  failureTtlMs: 60_000,
  cacheEntries: 256,
} as const;

export interface CimdClient {
  readonly clientId: string;
  /** From the document; shown on the consent page only, labelled unverified when the host is not trusted. */
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
}

export type CimdFailure =
  | 'cimd_invalid_client_id'
  | 'cimd_blocked'
  | 'cimd_fetch_failed'
  | 'cimd_invalid_document';

export type CimdResult =
  | { readonly ok: true; readonly client: CimdClient }
  | { readonly ok: false; readonly reason: CimdFailure };

const CimdDocumentSchema = z
  .object({
    client_id: z.string(),
    client_name: z.string().trim().min(1).max(200).optional(),
    redirect_uris: z.array(z.string().max(2048)).min(1).max(20),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
  })
  // Other registered metadata (logo_uri, client_uri, …) is allowed and ignored.
  .passthrough();

/**
 * Static rules for a CIMD client id: `https`, a path other than `/`, no
 * fragment, no userinfo, no dot segments, at most 2048 characters. The
 * SSRF checks (internal names, Seald's own hosts, port 443) run on fetch.
 */
export function isCimdClientId(clientId: string): boolean {
  if (clientId.length > 2048 || !clientId.startsWith('https://')) return false;
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hash !== '' || clientId.includes('#')) return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.pathname === '/' || url.pathname === '') return false;
  if (/\/\.\.?(\/|$)/.test(url.pathname)) return false;
  // The id must already be in its normalized form, so string equality holds.
  return url.toString() === clientId;
}

/** Validate a fetched document against the client id it was fetched for. */
export function parseCimdDocument(clientId: string, raw: unknown): CimdResult {
  const parsed = CimdDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'cimd_invalid_document' };
  const doc = parsed.data;
  if (doc.client_id !== clientId) return { ok: false, reason: 'cimd_invalid_document' };
  // Public clients only: no client secret, no other auth method.
  if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== 'none') {
    return { ok: false, reason: 'cimd_invalid_document' };
  }
  if ('client_secret' in doc) return { ok: false, reason: 'cimd_invalid_document' };
  if (doc.grant_types && !doc.grant_types.includes('authorization_code')) {
    return { ok: false, reason: 'cimd_invalid_document' };
  }
  if (doc.response_types && !doc.response_types.includes('code')) {
    return { ok: false, reason: 'cimd_invalid_document' };
  }
  if (!doc.redirect_uris.every(isAllowedRedirectUri)) {
    return { ok: false, reason: 'cimd_invalid_document' };
  }
  return {
    ok: true,
    client: { clientId, clientName: doc.client_name ?? null, redirectUris: doc.redirect_uris },
  };
}

@Injectable()
export class CimdFetcher {
  private readonly log = new Logger(CimdFetcher.name);
  private readonly cache = new Map<string, { readonly at: number; readonly result: CimdResult }>();
  private readonly ownHosts: readonly string[];
  private readonly allowance: WebhookTestAllowance;
  private readonly resolver: WebhookResolver;
  private readonly http: PinnedGet;

  constructor(
    @Inject(APP_ENV) env: AppEnv,
    @Optional() @Inject(CIMD_RESOLVER) resolver?: WebhookResolver,
    @Optional() @Inject(CIMD_TEST_ALLOWANCE) allowance?: WebhookTestAllowance,
    @Optional() @Inject(CIMD_HTTP_CLIENT) http?: PinnedGet,
  ) {
    this.ownHosts = sealdOwnHosts([
      env.APP_PUBLIC_URL,
      env.SUPABASE_URL,
      env.DATABASE_URL,
      env.CORS_ORIGIN,
      env.API_PUBLIC_URL,
      env.MCP_OAUTH_ISSUER,
    ]);
    this.allowance = effectiveAllowance(env.NODE_ENV, allowance);
    this.resolver = resolver ?? defaultResolver;
    this.http = http ?? pinnedGet;
  }

  async fetch(clientId: string, now: number = Date.now()): Promise<CimdResult> {
    if (!isCimdClientId(clientId)) return { ok: false, reason: 'cimd_invalid_client_id' };
    const hit = this.cache.get(clientId);
    if (hit) {
      const ttl = hit.result.ok ? CIMD_LIMITS.cacheTtlMs : CIMD_LIMITS.failureTtlMs;
      if (now - hit.at < ttl) return hit.result;
      this.cache.delete(clientId);
    }
    const result = await this.load(clientId);
    if (this.cache.size >= CIMD_LIMITS.cacheEntries) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(clientId, { at: now, result });
    return result;
  }

  private async load(clientId: string): Promise<CimdResult> {
    const resolved = await resolveWebhookTarget(clientId, {
      ownHosts: this.ownHosts,
      resolver: this.resolver,
      allowance: this.allowance,
    });
    if (!resolved.ok) {
      // Never log the URL's path or query: only the host and the reason.
      this.log.warn(`cimd ${resolved.kind} host=${hostOf(clientId)} reason=${resolved.reason}`);
      return {
        ok: false,
        reason: resolved.kind === 'blocked' ? 'cimd_blocked' : 'cimd_fetch_failed',
      };
    }
    let res: PinnedGetResult;
    try {
      res = await this.http({
        target: resolved.target,
        headers: { Accept: 'application/json', 'User-Agent': 'SealdOAuth/1' },
        connectTimeoutMs: CIMD_LIMITS.connectTimeoutMs,
        totalTimeoutMs: CIMD_LIMITS.totalTimeoutMs,
        maxResponseBytes: CIMD_LIMITS.maxBytes,
      });
    } catch (err) {
      this.log.warn(
        `cimd fetch failed host=${hostOf(clientId)} type=${err instanceof Error ? err.message : typeof err}`,
      );
      return { ok: false, reason: 'cimd_fetch_failed' };
    }
    if (res.status !== 200 || res.truncated) {
      this.log.warn(
        `cimd fetch status=${res.status} truncated=${res.truncated} host=${hostOf(clientId)}`,
      );
      return { ok: false, reason: 'cimd_fetch_failed' };
    }
    if (!/^application\/([a-z0-9.+-]*\+)?json\b/i.test(res.contentType ?? '')) {
      return { ok: false, reason: 'cimd_invalid_document' };
    }
    let json: unknown;
    try {
      json = JSON.parse(res.body.toString('utf8'));
    } catch {
      return { ok: false, reason: 'cimd_invalid_document' };
    }
    return parseCimdDocument(clientId, json);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
}
