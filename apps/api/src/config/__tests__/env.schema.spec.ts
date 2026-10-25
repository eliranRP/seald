import type { FeatureFlag } from 'shared';
import { parseEnv } from '../env.schema';

// Fake, low-entropy key material: the right shape (32 bytes as 64 hex
// characters), never a real secret. workflowAutomations ships on, so every
// env that boots needs a well-formed AUTOMATION_SECRETS_KEY.
const AUTOMATION_SECRETS_KEY = 'ab'.repeat(32);

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
});

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
    AUTOMATION_SECRETS_KEY,
  };

  it('parses a valid env', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });

  it('takes the service key from SEALD_SERVICE_ROLE_KEY over the platform one (Edge Functions)', () => {
    const env = parseEnv({
      ...valid,
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-jwt-injected-by-the-platform',
      SEALD_SERVICE_ROLE_KEY: 'sb_secret_example',
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('sb_secret_example');
    expect(parseEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: 'k' }).SUPABASE_SERVICE_ROLE_KEY).toBe(
      'k',
    );
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
    APP_PUBLIC_URL: 'http://localhost:5173',
    AUTOMATION_SECRETS_KEY,
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
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db?sslmode=disable',
    AUTOMATION_SECRETS_KEY,
  };

  it('accepts minimal test env with all phase 3 defaults applied', () => {
    const env = parseEnv(minimalTest);
    expect(env.EMAIL_PROVIDER).toBe('logging');
    // No default since WP-01 (rule S.1): unset means NoopPadesSigner,
    // which SealingModule refuses in production without the escape hatch.
    expect(env.PDF_SIGNING_PROVIDER).toBeUndefined();
    expect(env.PDF_SIGNING_ALLOW_NOOP).toBeUndefined();
    expect(env.STORAGE_BUCKET).toBe('envelopes');
    expect(env.TC_VERSION).toBe('2026-09-30.2');
    expect(env.PRIVACY_VERSION).toBe('2026-09-30.3');
    expect(env.APP_PUBLIC_URL).toBe('http://localhost:5173');
    expect(env.PDF_SIGNING_TSA_URL).toBe('https://freetsa.org/tsr');
    expect(env.EMAIL_FROM_ADDRESS).toBe('onboarding@resend.dev');
    expect(env.EMAIL_FROM_NAME).toBe('Seald');
    expect(env.EMAIL_LEGAL_ENTITY).toBe('Seald');
    expect(env.EMAIL_LEGAL_ENTITY).not.toMatch(/Azulay|Eliran/);
    expect(env.EMAIL_LEGAL_POSTAL).toBe('Chlenov 24, Tel Aviv-Yafo 6604806, Israel');
  });

  // Regression for the 2026-05-07 prod incident where stale containers
  // started without APP_PUBLIC_URL/CORS_ORIGIN set, fell back to the
  // localhost default, and baked `http://localhost:5173` into audit-PDF
  // QR codes + completed-email verify links. The defaults are gone;
  // every container now fails fast on missing config.
  it('throws when APP_PUBLIC_URL is missing', () => {
    const { APP_PUBLIC_URL: _omit, ...rest } = minimalTest;
    expect(() => parseEnv(rest)).toThrow(/APP_PUBLIC_URL/);
  });

  it('throws when CORS_ORIGIN is missing', () => {
    const { CORS_ORIGIN: _omit, ...rest } = minimalTest;
    expect(() => parseEnv(rest)).toThrow(/CORS_ORIGIN/);
  });

  it('rejects APP_PUBLIC_URL containing localhost in production', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
        APP_PUBLIC_URL: 'http://localhost:5173',
      }),
    ).toThrow(/APP_PUBLIC_URL.*must not contain localhost/);
  });

  it('rejects CORS_ORIGIN containing localhost in production', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
        APP_PUBLIC_URL: 'https://seald.app',
        CORS_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow(/CORS_ORIGIN.*must not contain localhost/);
  });

  it('requires signer session and cron secrets in production', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
        APP_PUBLIC_URL: 'https://seald.app',
        CORS_ORIGIN: 'https://seald.app',
      }),
    ).toThrow(/SIGNER_SESSION_SECRET/);
  });

  it('requires local p12 path + pass in production when provider=local', () => {
    expect(() =>
      parseEnv({
        ...minimalTest,
        NODE_ENV: 'production',
        APP_PUBLIC_URL: 'https://seald.app',
        CORS_ORIGIN: 'https://seald.app',
        SIGNER_SESSION_SECRET: '0'.repeat(64),
        CRON_SECRET: '1'.repeat(64),
        PDF_SIGNING_PROVIDER: 'local',
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
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM_ADDRESS: 'noreply@seald.app',
      EMAIL_FROM_NAME: 'Seald',
      PDF_SIGNING_PROVIDER: 'sslcom',
      PDF_SIGNING_SSLCOM_CLIENT_ID: 'id',
      PDF_SIGNING_SSLCOM_CLIENT_SECRET: 'sec',
      PDF_SIGNING_SSLCOM_CERT_ID: 'cert',
      PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
      // Required while signerAccessAuth / mcpServer+publicApi /
      // workflowAutomations are on (they ship on). Fake fixtures.
      SIGNER_OTP_KEY: 'o'.repeat(48),
      APPROVAL_CSRF_KEY: 'k'.repeat(40),
      AUTOMATION_SECRETS_KEY,
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.PDF_SIGNING_PROVIDER).toBe('sslcom');
  });
});

describe('env.schema — WORKER_ENABLED', () => {
  const base = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
    AUTOMATION_SECRETS_KEY,
  };

  it('parses "false" as false', () => {
    expect(parseEnv({ ...base, WORKER_ENABLED: 'false' }).WORKER_ENABLED).toBe(false);
  });

  it('parses "true" as true', () => {
    expect(parseEnv({ ...base, WORKER_ENABLED: 'true' }).WORKER_ENABLED).toBe(true);
  });

  it('parses "0" as false and "1" as true', () => {
    expect(parseEnv({ ...base, WORKER_ENABLED: '0' }).WORKER_ENABLED).toBe(false);
    expect(parseEnv({ ...base, WORKER_ENABLED: '1' }).WORKER_ENABLED).toBe(true);
  });

  it('defaults to false when unset', () => {
    expect(parseEnv(base).WORKER_ENABLED).toBe(false);
  });

  it('rejects garbage with a clear message', () => {
    expect(() => parseEnv({ ...base, WORKER_ENABLED: 'yes' })).toThrow(
      /WORKER_ENABLED: must be a boolean string: "true", "false", "1", or "0"/,
    );
  });
});

describe('env.schema — PDF_SIGNING_ALLOW_NOOP (WP-01, rule S.1)', () => {
  const base = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
    AUTOMATION_SECRETS_KEY,
  };

  it('parses "true" / "1" as true and "false" / "0" as false', () => {
    expect(parseEnv({ ...base, PDF_SIGNING_ALLOW_NOOP: 'true' }).PDF_SIGNING_ALLOW_NOOP).toBe(true);
    expect(parseEnv({ ...base, PDF_SIGNING_ALLOW_NOOP: '1' }).PDF_SIGNING_ALLOW_NOOP).toBe(true);
    expect(parseEnv({ ...base, PDF_SIGNING_ALLOW_NOOP: 'false' }).PDF_SIGNING_ALLOW_NOOP).toBe(
      false,
    );
    expect(parseEnv({ ...base, PDF_SIGNING_ALLOW_NOOP: '0' }).PDF_SIGNING_ALLOW_NOOP).toBe(false);
  });

  it('rejects garbage with a clear message', () => {
    expect(() => parseEnv({ ...base, PDF_SIGNING_ALLOW_NOOP: 'yes' })).toThrow(
      /PDF_SIGNING_ALLOW_NOOP: must be a boolean string/,
    );
  });
});

describe('env.schema — keys required by the parity flags', () => {
  const prod = {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    CORS_ORIGIN: 'https://seald.app',
    APP_PUBLIC_URL: 'https://seald.app',
    DATABASE_URL: 'postgres://u:p@h:5432/d?sslmode=require',
    SIGNER_SESSION_SECRET: '0'.repeat(64),
    CRON_SECRET: '1'.repeat(64),
    SIGNER_OTP_KEY: 'o'.repeat(48),
    APPROVAL_CSRF_KEY: 'k'.repeat(40),
    AUTOMATION_SECRETS_KEY,
  };

  it('boots a production env that carries every key', () => {
    expect(parseEnv(prod).NODE_ENV).toBe('production');
  });

  it('refuses to boot without SIGNER_OTP_KEY while signerAccessAuth is on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { signerAccessAuth: true };
    const { SIGNER_OTP_KEY: _omit, ...rest } = prod;
    expect(() => parseEnv(rest)).toThrow(/SIGNER_OTP_KEY required/);
  });

  it('boots without SIGNER_OTP_KEY while signerAccessAuth is off', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { signerAccessAuth: false };
    const { SIGNER_OTP_KEY: _omit, ...rest } = prod;
    expect(() => parseEnv(rest)).not.toThrow();
  });

  it('refuses to boot in production without APPROVAL_CSRF_KEY while mcpServer or publicApi is on', () => {
    const { APPROVAL_CSRF_KEY: _omit, ...rest } = prod;
    for (const [mcpServer, publicApi] of [
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer, publicApi };
      expect(() => parseEnv(rest)).toThrow(/APPROVAL_CSRF_KEY required/);
    }
  });

  it('boots without APPROVAL_CSRF_KEY when mcpServer and publicApi are both off', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: false, publicApi: false };
    const { APPROVAL_CSRF_KEY: _omit, ...rest } = prod;
    expect(() => parseEnv(rest)).not.toThrow();
  });

  it('refuses to boot without AUTOMATION_SECRETS_KEY while workflowAutomations is on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    const { AUTOMATION_SECRETS_KEY: _omit, ...rest } = prod;
    expect(() => parseEnv(rest)).toThrow(/AUTOMATION_SECRETS_KEY required/);
  });
});
