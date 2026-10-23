import { isCimdClientId, parseCimdDocument } from '../cimd';
import { connectedAppLabel } from '../connected-app-label';
import { parsePreregisteredClients, parseVerifiedCimdHosts } from '../oauth-clients-env';
import { buildMcpOAuthConfig } from '../oauth-config';
import { intersectScopes, parseScopeParam } from '../oauth-scopes';
import {
  hashSecret,
  looksLikeAccessToken,
  looksLikeAuthorizationCode,
  looksLikeRefreshToken,
  mintAccessToken,
  mintAuthorizationCode,
  mintRefreshToken,
} from '../oauth-secrets';
import { isValidCodeVerifier, isValidS256Challenge, s256Challenge, verifyS256 } from '../pkce';
import { isAllowedRedirectUri, matchRedirectUri, withQuery } from '../redirect-uri';
import { CIMD_CLIENT, cimdDoc, testEnv } from './oauth-fixtures';

describe('PKCE (S256 only)', () => {
  // RFC 7636 appendix B test vector.
  const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('computes the RFC 7636 challenge and verifies it', () => {
    expect(s256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    expect(verifyS256(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it('rejects a wrong verifier, a malformed verifier and a malformed challenge', () => {
    expect(verifyS256(`${RFC_VERIFIER.slice(0, -1)}A`, RFC_CHALLENGE)).toBe(false);
    expect(verifyS256('short', RFC_CHALLENGE)).toBe(false);
    expect(verifyS256(RFC_VERIFIER, 'not-a-challenge')).toBe(false);
    expect(verifyS256(undefined, RFC_CHALLENGE)).toBe(false);
    // `plain` would send the verifier itself as the challenge: never accepted.
    expect(verifyS256(RFC_VERIFIER, RFC_VERIFIER)).toBe(false);
  });

  it('bounds the verifier to 43–128 unreserved characters and the challenge to 43', () => {
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}+`)).toBe(false);
    expect(isValidS256Challenge(RFC_CHALLENGE)).toBe(true);
    expect(isValidS256Challenge(`${RFC_CHALLENGE}=`)).toBe(false);
  });
});

describe('redirect URI rules', () => {
  it('allows https and RFC 8252 loopback only', () => {
    expect(isAllowedRedirectUri('https://claude.example/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:5000/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://[::1]/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:5000/cb')).toBe(false);
    expect(isAllowedRedirectUri('http://claude.example/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://claude.example/cb#frag')).toBe(false);
    expect(isAllowedRedirectUri('https://user:pw@claude.example/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('com.example.app:/cb')).toBe(false);
    expect(isAllowedRedirectUri(' https://claude.example/cb')).toBe(false);
  });

  it('matches https URIs by exact string only', () => {
    const reg = ['https://claude.example/cb'];
    expect(matchRedirectUri('https://claude.example/cb', reg)).toBe(true);
    expect(matchRedirectUri('https://claude.example/cb/', reg)).toBe(false);
    expect(matchRedirectUri('https://claude.example/CB', reg)).toBe(false);
    expect(matchRedirectUri('https://claude.example/cb?x=1', reg)).toBe(false);
    expect(matchRedirectUri('https://claude.example:443/cb', reg)).toBe(false);
    expect(matchRedirectUri('https://evil.example/cb', reg)).toBe(false);
    expect(matchRedirectUri('https://claude.example.evil.test/cb', reg)).toBe(false);
  });

  it('ignores only the port for loopback URIs', () => {
    const reg = ['http://127.0.0.1/callback'];
    expect(matchRedirectUri('http://127.0.0.1:53682/callback', reg)).toBe(true);
    expect(matchRedirectUri('http://127.0.0.1/callback', reg)).toBe(true);
    expect(matchRedirectUri('http://127.0.0.1:53682/other', reg)).toBe(false);
    expect(matchRedirectUri('http://127.0.0.1:53682/callback?x=1', reg)).toBe(false);
    expect(matchRedirectUri('http://[::1]:53682/callback', reg)).toBe(false);
    expect(matchRedirectUri('http://[::1]:1/cb', ['http://[::1]:2/cb'])).toBe(true);
  });

  it('appends response parameters to the query, keeping the existing ones', () => {
    expect(withQuery('https://c.example/cb?a=1', { code: 'x', state: undefined })).toBe(
      'https://c.example/cb?a=1&code=x',
    );
  });
});

describe('scopes', () => {
  it('defaults to envelopes:read and keeps catalogue order', () => {
    expect(parseScopeParam(undefined)).toEqual({ ok: true, scopes: ['envelopes:read'] });
    expect(parseScopeParam('envelopes:send envelopes:read envelopes:read')).toEqual({
      ok: true,
      scopes: ['envelopes:read', 'envelopes:send'],
    });
  });

  it('refuses an unknown scope instead of dropping it', () => {
    expect(parseScopeParam('envelopes:read admin:everything')).toEqual({ ok: false });
  });

  it('intersects and drops strings outside the catalogue', () => {
    expect(
      intersectScopes(['envelopes:read', 'bogus', 'contacts:read'], ['contacts:read']),
    ).toEqual(['contacts:read']);
  });
});

describe('opaque secrets', () => {
  it('mints prefixed 256-bit values and stores only a SHA-256', () => {
    const a = mintAccessToken();
    const r = mintRefreshToken();
    const c = mintAuthorizationCode();
    expect(looksLikeAccessToken(a.token)).toBe(true);
    expect(looksLikeRefreshToken(r.token)).toBe(true);
    expect(looksLikeAuthorizationCode(c.token)).toBe(true);
    expect(looksLikeAccessToken(r.token)).toBe(false);
    expect(a.hash).toBe(hashSecret(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
});

describe('client configuration', () => {
  it('parses the pre-registered allow-list and refuses bad redirect URIs or repeats', () => {
    expect(
      parsePreregisteredClients(
        JSON.stringify([
          { client_id: 'c1', client_name: 'One', redirect_uris: ['https://a.example/cb'] },
        ]),
      ),
    ).toEqual([{ clientId: 'c1', clientName: 'One', redirectUris: ['https://a.example/cb'] }]);
    expect(parsePreregisteredClients(undefined)).toEqual([]);
    expect(() =>
      parsePreregisteredClients(
        JSON.stringify([
          { client_id: 'c1', client_name: 'One', redirect_uris: ['http://a.example/cb'] },
        ]),
      ),
    ).toThrow('MCP_OAUTH_CLIENTS is invalid');
    const one = { client_id: 'c1', client_name: 'One', redirect_uris: ['https://a.example/cb'] };
    expect(() => parsePreregisteredClients(JSON.stringify([one, one]))).toThrow('repeats');
    expect(() => parsePreregisteredClients('not json')).toThrow('JSON array');
    expect(parseVerifiedCimdHosts(' A.example , ,b.example')).toEqual(['a.example', 'b.example']);
  });

  it('derives the issuer and the /mcp resource', () => {
    const cfg = buildMcpOAuthConfig(testEnv({ MCP_OAUTH_ISSUER: 'https://api.x.test/' }));
    expect(cfg.issuer).toBe('https://api.x.test');
    expect(cfg.resource).toBe('https://api.x.test/mcp');
    const derived = buildMcpOAuthConfig(
      testEnv({ MCP_OAUTH_ISSUER: undefined, APP_PUBLIC_URL: 'https://seald.nromomentum.com' }),
    );
    expect(derived.resource).toBe('https://api.seald.nromomentum.com/mcp');
  });

  it('labels a CIMD app by its host, never by the name its document claims', () => {
    expect(connectedAppLabel('preregistered', 'c1', 'Claude')).toBe('Claude (connected app)');
    expect(connectedAppLabel('cimd', CIMD_CLIENT, 'Totally Seald')).toBe(
      'agent.example.org (connected app)',
    );
  });
});

describe('CIMD documents', () => {
  it('accepts only normalized https client ids with a path', () => {
    expect(isCimdClientId(CIMD_CLIENT)).toBe(true);
    expect(isCimdClientId('http://agent.example.org/c.json')).toBe(false);
    expect(isCimdClientId('https://agent.example.org/')).toBe(false);
    expect(isCimdClientId('https://agent.example.org')).toBe(false);
    expect(isCimdClientId('https://agent.example.org/c.json#x')).toBe(false);
    expect(isCimdClientId('https://u:p@agent.example.org/c.json')).toBe(false);
    expect(isCimdClientId('https://agent.example.org/a/../c.json')).toBe(false);
    expect(isCimdClientId('https://AGENT.example.org/c.json')).toBe(false);
  });

  it('requires the document to name itself and to be a public client with safe redirects', () => {
    expect(parseCimdDocument(CIMD_CLIENT, cimdDoc())).toMatchObject({ ok: true });
    for (const bad of [
      cimdDoc({ client_id: 'https://other.example/c.json' }),
      cimdDoc({ token_endpoint_auth_method: 'client_secret_basic' }),
      cimdDoc({ client_secret: 'x' }),
      cimdDoc({ redirect_uris: ['http://agent.example.org/cb'] }),
      cimdDoc({ redirect_uris: [] }),
      cimdDoc({ grant_types: ['client_credentials'] }),
      'not an object',
    ]) {
      expect(parseCimdDocument(CIMD_CLIENT, bad)).toEqual({
        ok: false,
        reason: 'cimd_invalid_document',
      });
    }
  });
});
