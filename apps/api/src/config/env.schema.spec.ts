import { parseEnv } from './env.schema';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'test',
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

describe('env.schema — Phase 3 envelopes extensions', () => {
  const minimalTest = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db?sslmode=disable',
  };

  it('accepts minimal test env with all phase 3 defaults applied', () => {
    const env = parseEnv(minimalTest);
    expect(env.EMAIL_PROVIDER).toBe('logging');
    expect(env.PDF_SIGNING_PROVIDER).toBe('local');
    expect(env.STORAGE_BUCKET).toBe('envelopes');
    expect(env.TC_VERSION).toBeDefined();
    expect(env.PRIVACY_VERSION).toBeDefined();
    expect(env.APP_PUBLIC_URL).toBe('http://localhost:5173');
    expect(env.ENVELOPE_RETENTION_YEARS).toBe(7);
    expect(env.PDF_SIGNING_TSA_URL).toBe('https://freetsa.org/tsr');
    expect(env.EMAIL_FROM_ADDRESS).toBe('onboarding@resend.dev');
    expect(env.EMAIL_FROM_NAME).toBe('Seald');
  });

  it('requires signer session + cron + metrics secrets in production', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
      }),
    ).toThrow(/SIGNER_SESSION_SECRET/);
  });

  it('requires local p12 path + pass in production when provider=local', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
        SIGNER_SESSION_SECRET: '0'.repeat(64),
        CRON_SECRET: '1'.repeat(64),
        METRICS_SECRET: '2'.repeat(64),
      }),
    ).toThrow(/PDF_SIGNING_LOCAL_P12/);
  });

  it('requires RESEND_API_KEY when EMAIL_PROVIDER=resend', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        EMAIL_PROVIDER: 'resend',
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('requires SSL.com creds when PDF_SIGNING_PROVIDER=sslcom', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        PDF_SIGNING_PROVIDER: 'sslcom',
      }),
    ).toThrow(/PDF_SIGNING_SSLCOM/);
  });

  it('requires all 4 SMTP vars when EMAIL_PROVIDER=smtp', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        EMAIL_PROVIDER: 'smtp',
      }),
    ).toThrow(/SMTP_/);
  });

  it('accepts complete production env', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      SUPABASE_SERVICE_ROLE_KEY: 'svc_xyz',
      CORS_ORIGIN: 'https://seald.app',
      APP_PUBLIC_URL: 'https://seald.app',
      DATABASE_URL: 'postgres://u:p@h:5432/d?sslmode=require',
      STORAGE_BUCKET: 'envelopes',
      TC_VERSION: '2026-04-24',
      PRIVACY_VERSION: '2026-04-24',
      SIGNER_SESSION_SECRET: '0'.repeat(64),
      CRON_SECRET: '1'.repeat(64),
      METRICS_SECRET: '2'.repeat(64),
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM_ADDRESS: 'noreply@seald.app',
      EMAIL_FROM_NAME: 'Seald',
      PDF_SIGNING_PROVIDER: 'sslcom',
      PDF_SIGNING_SSLCOM_CLIENT_ID: 'id',
      PDF_SIGNING_SSLCOM_CLIENT_SECRET: 'sec',
      PDF_SIGNING_SSLCOM_CERT_ID: 'cert',
      PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.PDF_SIGNING_PROVIDER).toBe('sslcom');
  });
});
