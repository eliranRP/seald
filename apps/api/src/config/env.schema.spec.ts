import { parseEnv } from './env.schema';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('parses a valid env', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });

  it('defaults SUPABASE_JWT_AUDIENCE to "authenticated"', () => {
    const { SUPABASE_JWT_AUDIENCE: _, ...rest } = valid;
    const env = parseEnv(rest);
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });

  it('throws when SUPABASE_URL is missing', () => {
    const { SUPABASE_URL: _, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/SUPABASE_URL/);
  });

  it('throws when SUPABASE_URL is not a valid URL', () => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: 'not-a-url' })).toThrow(/SUPABASE_URL/);
  });

  it('throws when PORT is not numeric', () => {
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });
});
