import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import type { ApiKeyAuthService, ApiKeyVerifyResult } from '../../api-keys/api-key-auth.service';
import { MCP_PRINCIPAL, McpAuthGuard, McpFlagGuard, type McpRequest } from '../mcp-auth.guard';
import {
  OAuthAccessTokenService,
  type OAuthAccessVerifyResult,
} from '../oauth/oauth-access-token.service';
import type { McpOAuthConfig } from '../oauth/oauth-config';
import { pinProtocolVersion } from '../mcp.controller';
import { principal } from '../tools/__tests__/harness';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
  delete process.env.MCP_DISABLED;
});

const res = {
  headers: {} as Record<string, string>,
  setHeader(k: string, v: string) {
    this.headers[k] = v;
  },
};

function ctx(req: Partial<McpRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

const OAUTH_CONFIG = { issuer: 'https://api.seald.test', resource: 'https://api.seald.test/mcp' };

function guardWith(
  result: ApiKeyVerifyResult,
  oauthResult: OAuthAccessVerifyResult = { ok: false, error: 'invalid_token' },
): { guard: McpAuthGuard; verify: jest.Mock; oauthVerify: jest.Mock } {
  const verify = jest.fn(async () => result);
  const oauthVerify = jest.fn(async () => oauthResult);
  return {
    guard: new McpAuthGuard(
      { verify } as unknown as ApiKeyAuthService,
      { verify: oauthVerify } as unknown as OAuthAccessTokenService,
      OAUTH_CONFIG as unknown as McpOAuthConfig,
    ),
    verify,
    oauthVerify,
  };
}

beforeEach(() => {
  res.headers = {};
});

describe('McpFlagGuard', () => {
  it('404s while mcpServer is off (the shipped default)', () => {
    expect(() => new McpFlagGuard().canActivate()).toThrow(NotFoundException);
  });

  it('404s when MCP_DISABLED=true even with the flag on, read per request', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
    expect(new McpFlagGuard().canActivate()).toBe(true);
    process.env.MCP_DISABLED = 'true';
    expect(() => new McpFlagGuard().canActivate()).toThrow(NotFoundException);
  });
});

describe('McpAuthGuard', () => {
  it('passes the bearer to ApiKeyAuthService.verify and stores the principal', async () => {
    const p = principal();
    const { guard, verify } = guardWith(p);
    const req: Partial<McpRequest> = { headers: { authorization: 'Bearer abc' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('abc');
    expect(req[MCP_PRINCIPAL]).toBe(p);
  });

  it.each(['missing_token', 'invalid_token', 'api_key_revoked', 'api_key_expired'] as const)(
    '401s %s with that slug',
    async (error) => {
      const { guard } = guardWith({ ok: false, error });
      const err = await guard
        .canActivate(ctx({ headers: { authorization: 'Bearer abc' } }))
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe(error);
    },
  );

  it('401s a header that is not a single Bearer value without calling verify', async () => {
    const { guard, verify } = guardWith(principal());
    await expect(
      guard.canActivate(ctx({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('asks verify about a missing header (missing_token)', async () => {
    const { guard, verify } = guardWith({ ok: false, error: 'missing_token' });
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow('missing_token');
    expect(verify).toHaveBeenCalledWith(null);
  });
});

describe('McpAuthGuard with OAuth (WP-27)', () => {
  // Fake, low-entropy: the right shape, not a real token.
  const ACCESS = `seald_oat_${'x'.repeat(43)}`;
  const oauthPrincipal = {
    ...principal(['envelopes:read']),
    keyId: '77777777-7777-4777-8777-777777777777',
    keyPrefix: '',
    keyName: 'Claude (connected app)',
    oauth: {
      grantId: '77777777-7777-4777-8777-777777777777',
      clientId: '66666666-6666-4666-8666-666666666666',
    },
  };

  it('flag off: an OAuth-shaped bearer goes to the key verifier and 401s with no WWW-Authenticate', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: false };
    const { guard, verify, oauthVerify } = guardWith({ ok: false, error: 'invalid_token' });
    await expect(
      guard.canActivate(ctx({ headers: { authorization: `Bearer ${ACCESS}` } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(oauthVerify).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledWith(ACCESS);
    expect(res.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('flag on: an access token is verified by the OAuth verifier and its principal stored', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
    const { guard, verify, oauthVerify } = guardWith(
      { ok: false, error: 'invalid_token' },
      oauthPrincipal,
    );
    const req: Partial<McpRequest> = { headers: { authorization: `Bearer ${ACCESS}` } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(oauthVerify).toHaveBeenCalledWith(ACCESS);
    expect(verify).not.toHaveBeenCalled();
    expect(req[MCP_PRINCIPAL]?.oauth?.grantId).toBe(oauthPrincipal.oauth.grantId);
  });

  it('flag on: an API key still goes to the key verifier', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
    const p = principal();
    const { guard, oauthVerify } = guardWith(p);
    const req: Partial<McpRequest> = { headers: { authorization: 'Bearer abc' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(oauthVerify).not.toHaveBeenCalled();
    expect(req[MCP_PRINCIPAL]).toBe(p);
  });

  it('flag on: a missing credential 401s with the resource metadata pointer', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
    const { guard } = guardWith({ ok: false, error: 'missing_token' });
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow('missing_token');
    expect(res.headers['WWW-Authenticate']).toBe(
      'Bearer realm="seald", resource_metadata="https://api.seald.test/.well-known/oauth-protected-resource"',
    );
  });

  it('flag on: a bad access token 401s invalid_token with error="invalid_token"', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
    const { guard } = guardWith({ ok: false, error: 'invalid_token' });
    await expect(
      guard.canActivate(ctx({ headers: { authorization: `Bearer ${ACCESS}` } })),
    ).rejects.toThrow('invalid_token');
    expect(res.headers['WWW-Authenticate']).toContain('error="invalid_token"');
  });
});

describe('pinProtocolVersion', () => {
  const init = (v: unknown) => ({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: v, capabilities: {}, clientInfo: { name: 'c', version: '1' } },
  });

  it('keeps a supported version', () => {
    expect(pinProtocolVersion(init('2025-06-18'))).toEqual(init('2025-06-18'));
    expect(pinProtocolVersion(init('2025-11-25'))).toEqual(init('2025-11-25'));
  });

  it('answers an unsupported initialize with the current version', () => {
    expect(pinProtocolVersion(init('2024-11-05'))).toEqual(init('2025-11-25'));
    expect(pinProtocolVersion([init('1999-01-01')])).toEqual([init('2025-11-25')]);
  });

  it('leaves other messages alone', () => {
    const msg = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
    expect(pinProtocolVersion(msg)).toBe(msg);
    expect(pinProtocolVersion(null)).toBeNull();
  });
});
