import { NotFoundException } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import { ApiKeysFlagMiddleware, apiKeysEnabled } from '../api-keys-flag.middleware';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

function flags(mcpServer: boolean, publicApi: boolean): void {
  host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer, publicApi };
}

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
});

describe('apiKeysEnabled', () => {
  it('is off when both mcpServer and publicApi are off', () => {
    flags(false, false);
    expect(apiKeysEnabled({})).toBe(false);
  });

  it('is on with mcpServer alone or publicApi alone', () => {
    flags(true, false);
    expect(apiKeysEnabled({})).toBe(true);
    flags(false, true);
    expect(apiKeysEnabled({})).toBe(true);
  });

  it('MCP_DISABLED switches off the MCP half only', () => {
    flags(true, false);
    expect(apiKeysEnabled({ MCP_DISABLED: 'true' })).toBe(false);
    flags(true, true);
    expect(apiKeysEnabled({ MCP_DISABLED: 'true' })).toBe(true);
  });
});

describe('ApiKeysFlagMiddleware', () => {
  it('throws not_found when off and calls next when on', () => {
    const mw = new ApiKeysFlagMiddleware();
    const next = jest.fn();
    flags(false, false);
    expect(() => mw.use({}, {}, next)).toThrow(NotFoundException);
    expect(next).not.toHaveBeenCalled();
    flags(true, false);
    mw.use({}, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
