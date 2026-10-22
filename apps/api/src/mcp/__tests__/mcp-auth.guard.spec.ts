import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import type { ApiKeyAuthService, ApiKeyVerifyResult } from '../../api-keys/api-key-auth.service';
import { MCP_PRINCIPAL, McpAuthGuard, McpFlagGuard, type McpRequest } from '../mcp-auth.guard';
import { pinProtocolVersion } from '../mcp.controller';
import { principal } from '../tools/__tests__/harness';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
  delete process.env.MCP_DISABLED;
});

function ctx(req: Partial<McpRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function guardWith(result: ApiKeyVerifyResult): { guard: McpAuthGuard; verify: jest.Mock } {
  const verify = jest.fn(async () => result);
  return { guard: new McpAuthGuard({ verify } as unknown as ApiKeyAuthService), verify };
}

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
