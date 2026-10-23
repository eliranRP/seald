import { Inject, Injectable } from '@nestjs/common';
import { CimdFetcher, isCimdClientId, type CimdFailure } from './cimd';
import { clientIdHost } from './connected-app-label';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { redirectHost } from './redirect-uri';

/** A client the authorization server will talk to. Public clients only. */
export interface ResolvedClient {
  readonly clientId: string;
  readonly kind: 'preregistered' | 'cimd';
  /** Name shown on the consent page. */
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  /** A CIMD client whose host is not on the verified list. */
  readonly unverified: boolean;
  /** Host shown next to the name: the CIMD URL's host or the first redirect host. */
  readonly host: string;
}

export type ClientResolution =
  | { readonly ok: true; readonly client: ResolvedClient }
  | { readonly ok: false; readonly reason: 'unknown_client' | CimdFailure };

/**
 * Pre-registered clients (`MCP_OAUTH_CLIENTS`) win. Otherwise an `https`
 * client id is a CIMD client and its document is fetched. Anything else
 * is unknown: there is no dynamic registration endpoint.
 */
@Injectable()
export class OAuthClientResolver {
  constructor(
    @Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig,
    private readonly cimd: CimdFetcher,
  ) {}

  async resolve(clientId: string): Promise<ClientResolution> {
    const pre = this.config.preregistered.get(clientId);
    if (pre) {
      return {
        ok: true,
        client: {
          clientId,
          kind: 'preregistered',
          clientName: pre.clientName,
          redirectUris: pre.redirectUris,
          unverified: false,
          host: redirectHost(pre.redirectUris[0] ?? ''),
        },
      };
    }
    if (!isCimdClientId(clientId)) return { ok: false, reason: 'unknown_client' };
    const fetched = await this.cimd.fetch(clientId);
    if (!fetched.ok) return fetched;
    const host = clientIdHost(clientId);
    return {
      ok: true,
      client: {
        clientId,
        kind: 'cimd',
        clientName: fetched.client.clientName ?? host,
        redirectUris: fetched.client.redirectUris,
        unverified: !this.config.verifiedCimdHosts.has(new URL(clientId).hostname),
        host,
      },
    };
  }
}
