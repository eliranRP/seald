import { UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import { buildTestJwks } from '../../test/test-jwks';
import type { AppEnv } from '../config/env.schema';

const ISSUER = 'https://example.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

function makeEnv(): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: AUDIENCE,
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
    STORAGE_BUCKET: 'envelopes',
    TC_VERSION: '2026-04-24',
    PRIVACY_VERSION: '2026-04-24',
    EMAIL_PROVIDER: 'logging',
    EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
    EMAIL_FROM_NAME: 'Seald',
    PDF_SIGNING_PROVIDER: 'local',
    PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
    ENVELOPE_RETENTION_YEARS: 7,
    WORKER_ENABLED: false,
  };
}

describe('SupabaseJwtStrategy', () => {
  let strategy: SupabaseJwtStrategy;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeEach(async () => {
    tk = await buildTestJwks();
    strategy = new SupabaseJwtStrategy(makeEnv(), tk.resolver);
  });

  it('accepts a valid token and returns AuthUser', async () => {
    const token = await tk.sign(
      {
        sub: 'user-1',
        email: 'a@b.com',
        app_metadata: { provider: 'google' },
      },
      { issuer: ISSUER, audience: AUDIENCE },
    );
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: 'user-1', email: 'a@b.com', provider: 'google' });
  });

  it('returns email=null and provider=null when claims are absent', async () => {
    const token = await tk.sign({ sub: 'user-2' }, { issuer: ISSUER, audience: AUDIENCE });
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: 'user-2', email: null, provider: null });
  });

  it('rejects wrong issuer', async () => {
    const token = await tk.sign(
      { sub: 'u' },
      { issuer: 'https://evil.example/auth/v1', audience: AUDIENCE },
    );
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong audience', async () => {
    const token = await tk.sign({ sub: 'u' }, { issuer: ISSUER, audience: 'other' });
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired token', async () => {
    const token = await tk.sign(
      { sub: 'u' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '-1s' },
    );
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/token_expired/),
    });
  });

  it('rejects missing sub', async () => {
    const token = await tk.sign({}, { issuer: ISSUER, audience: AUDIENCE });
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid_token/),
    });
  });

  it('rejects bad signature (different key)', async () => {
    const other = await buildTestJwks();
    const token = await other.sign({ sub: 'u' }, { issuer: ISSUER, audience: AUDIENCE });
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid_token/),
    });
  });
});
