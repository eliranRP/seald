import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { buildTestJwks } from './test-jwks';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
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
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeAll(async () => {
    tk = await buildTestJwks();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableCors({ origin: TEST_ENV.CORS_ORIGIN, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /me without Authorization returns 401 missing_token', async () => {
    const res = await request(app.getHttpServer()).get('/me').expect(401);
    expect(res.body.error).toBe('missing_token');
  });

  it('GET /me with expired token returns 401 token_expired', async () => {
    const token = await tk.sign(
      { sub: '00000000-0000-4000-8000-000000000001' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE, expiresIn: '-1s' },
    );
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.error).toBe('token_expired');
  });

  it('GET /me with valid token returns the user', async () => {
    const token = await tk.sign(
      {
        sub: '00000000-0000-4000-8000-000000000001',
        email: 'a@b.com',
        app_metadata: { provider: 'google' },
      },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ id: '00000000-0000-4000-8000-000000000001', email: 'a@b.com', provider: 'google' });
  });

  it('CORS preflight from allowed origin succeeds', async () => {
    await request(app.getHttpServer())
      .options('/health')
      .set('Origin', TEST_ENV.CORS_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
  });

  it('CORS never echoes a caller-supplied origin (browser-enforced block)', async () => {
    // With `origin: CORS_ORIGIN` as a plain string, the cors middleware always
    // echoes the configured origin, never the caller's. A browser receiving this
    // mismatch will block the cross-origin read. This asserts that invariant.
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ENV.CORS_ORIGIN);
  });
});
