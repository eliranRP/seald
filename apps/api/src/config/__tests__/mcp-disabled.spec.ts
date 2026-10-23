import { parseEnv } from '../env.schema';
import { mcpDisabled } from '../mcp-disabled';

const base = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@host:5432/db',
  // Fake 32-byte key: workflowAutomations ships on, so boot needs one.
  AUTOMATION_SECRETS_KEY: 'ab'.repeat(32),
};

describe('env.schema — MCP_DISABLED', () => {
  it('is optional and parses the strict boolean strings', () => {
    expect(parseEnv(base).MCP_DISABLED).toBe(false);
    expect(parseEnv({ ...base, MCP_DISABLED: 'true' }).MCP_DISABLED).toBe(true);
    expect(parseEnv({ ...base, MCP_DISABLED: '1' }).MCP_DISABLED).toBe(true);
    expect(parseEnv({ ...base, MCP_DISABLED: 'false' }).MCP_DISABLED).toBe(false);
    expect(parseEnv({ ...base, MCP_DISABLED: '0' }).MCP_DISABLED).toBe(false);
  });

  it('rejects garbage at boot', () => {
    expect(() => parseEnv({ ...base, MCP_DISABLED: 'yes' })).toThrow(
      /MCP_DISABLED: must be a boolean string/,
    );
  });
});

describe('mcpDisabled (request time)', () => {
  it('treats "true" and "1" as disabled, anything else as enabled', () => {
    expect(mcpDisabled({ MCP_DISABLED: 'true' })).toBe(true);
    expect(mcpDisabled({ MCP_DISABLED: '1' })).toBe(true);
    expect(mcpDisabled({ MCP_DISABLED: 'false' })).toBe(false);
    expect(mcpDisabled({})).toBe(false);
  });

  it('reads process.env on each call, so a flip needs no restart', () => {
    const before = process.env.MCP_DISABLED;
    try {
      delete process.env.MCP_DISABLED;
      expect(mcpDisabled()).toBe(false);
      process.env.MCP_DISABLED = 'true';
      expect(mcpDisabled()).toBe(true);
    } finally {
      if (before === undefined) delete process.env.MCP_DISABLED;
      else process.env.MCP_DISABLED = before;
    }
  });
});
