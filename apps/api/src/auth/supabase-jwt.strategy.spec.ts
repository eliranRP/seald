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
    EMAIL_LEGAL_ENTITY: 'Seald, Inc.',
    EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
    EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
    EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
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

  // Canonical UUIDs — Supabase always issues these as `sub`, and the
  // strategy now enforces UUID-shape at the boundary (issue #44).
  const UUID_1 = '11111111-1111-4111-8111-111111111111';
  const UUID_2 = '22222222-2222-4222-8222-222222222222';

  it('accepts a valid token and returns AuthUser', async () => {
    const token = await tk.sign(
      {
        sub: UUID_1,
        email: 'a@b.com',
        app_metadata: { provider: 'google' },
      },
      { issuer: ISSUER, audience: AUDIENCE },
    );
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: UUID_1, email: 'a@b.com', provider: 'google' });
  });

  it('returns email=null and provider=null when claims are absent', async () => {
    const token = await tk.sign({ sub: UUID_2 }, { issuer: ISSUER, audience: AUDIENCE });
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: UUID_2, email: null, provider: null });
  });

  it('rejects wrong issuer', async () => {
    const token = await tk.sign(
      { sub: UUID_1 },
      { issuer: 'https://evil.example/auth/v1', audience: AUDIENCE },
    );
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong audience', async () => {
    const token = await tk.sign({ sub: UUID_1 }, { issuer: ISSUER, audience: 'other' });
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired token', async () => {
    const token = await tk.sign(
      { sub: UUID_1 },
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
    const token = await other.sign({ sub: UUID_1 }, { issuer: ISSUER, audience: AUDIENCE });
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid_token/),
    });
  });

  it('rejects non-UUID sub (issue #44 — defense against header injection)', async () => {
    // A misconfigured / hostile issuer could place a `"` byte in `sub`,
    // which used to flow verbatim into Content-Disposition. Reject at
    // the boundary so downstream callers can trust the shape — strict
    // 8-4-4-4-12 hex, anything else 401s.
    for (const badSub of [
      'user-1', // legacy non-UUID
      '../../../etc/passwd',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; filename="evil.txt',
      '11111111-1111-4111-8111-11111111111', // 1 char short
      'gggggggg-gggg-gggg-gggg-gggggggggggg', // non-hex
      '11111111_1111_4111_8111_111111111111', // wrong separator
      '', // empty (already covered by the missing-sub branch but good belt+braces)
    ]) {
      const token = await tk.sign({ sub: badSub }, { issuer: ISSUER, audience: AUDIENCE });
      await expect(strategy.validate(token)).rejects.toMatchObject({
        message: expect.stringMatching(/invalid_token/),
      });
    }
  });
});
