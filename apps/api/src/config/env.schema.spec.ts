import { parseEnv } from './env.schema';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
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

describe('env.schema — DATABASE_URL', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('rejects missing DATABASE_URL', () => {
    expect(() => parseEnv(base)).toThrow(/DATABASE_URL/);
  });

  it('rejects DATABASE_URL that is not a postgres URL', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'http://not-postgres' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('accepts a postgres:// URL', () => {
    const env = parseEnv({ ...base, DATABASE_URL: 'postgres://u:p@host:5432/db?sslmode=require' });
    expect(env.DATABASE_URL).toBe('postgres://u:p@host:5432/db?sslmode=require');
  });

  it('accepts a postgresql:// URL', () => {
    const env = parseEnv({ ...base, DATABASE_URL: 'postgresql://u:p@host:5432/db' });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@host:5432/db');
  });
});
