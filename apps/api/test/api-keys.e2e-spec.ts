import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { isFeatureEnabled } from 'shared';
import { AppModule } from '../src/app.module';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ApiKeysRepository } from '../src/api-keys/api-keys.repository';
import { InMemoryApiKeysRepository } from '../src/api-keys/api-keys.repository.memory';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { buildTestJwks } from './test-jwks';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
  STORAGE_BUCKET: 'envelopes',
  TC_VERSION: '2026-04-24',
  PRIVACY_VERSION: '2026-04-24',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

const USER_ID = '00000000-0000-4000-8000-00000000000a';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

function enableMcp(): void {
  (
    globalThis as { __SEALD_FEATURE_OVERRIDES__?: { mcpServer?: boolean } }
  ).__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
  delete process.env.MCP_DISABLED;
}

function disableMcp(): void {
  (
    globalThis as { __SEALD_FEATURE_OVERRIDES__?: { mcpServer?: boolean } }
  ).__SEALD_FEATURE_OVERRIDES__ = { mcpServer: false };
}

describe('API keys (e2e)', () => {
  let app: INestApplication;
  let keys: InMemoryApiKeysRepository;
  let emails: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let token: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    keys = new InMemoryApiKeysRepository();
    emails = new InMemoryOutboundEmailsRepository();
    const fresh = Math.floor(Date.now() / 1000);
    token = await tk.sign(
      {
        sub: USER_ID,
        email: 'maya@example.com',
        app_metadata: { provider: 'email' },
        amr: [{ method: 'password', timestamp: fresh }],
      },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(ApiKeysRepository)
      .useValue(keys)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(emails)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    keys.reset();
    emails.reset();
    enableMcp();
  });

  afterAll(async () => {
    disableMcp();
    delete (globalThis as { __SEALD_FEATURE_OVERRIDES__?: unknown }).__SEALD_FEATURE_OVERRIDES__;
    await app.close();
  });

  it('404s key routes when the flag is off', async () => {
    disableMcp();
    expect(isFeatureEnabled('mcpServer')).toBe(false);
    const listed = await request(app.getHttpServer())
      .get('/me/api-keys')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(404);
    const created = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(created.status).toBe(404);
  });

  it('creates, lists without the secret, and revokes', async () => {
    const created = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Key 1');
    expect(created.body.scopes).toEqual(['envelopes:read']);
    expect(created.body.require_owner_approval).toBe(true);
    expect(created.body.secret).toMatch(/^seald_live_/);
    const secret = created.body.secret as string;

    const listed = await request(app.getHttpServer())
      .get('/me/api-keys')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(JSON.stringify(listed.body)).not.toContain('key_hash');

    const notice = emails.rows.find((row) => row.kind === 'api_key_created');
    expect(JSON.stringify(notice?.payload ?? {})).not.toContain(secret);
    expect(notice?.payload).toMatchObject({ key_name: 'Key 1', key_prefix: created.body.prefix });

    const revoked = await request(app.getHttpServer())
      .post(`/me/api-keys/${created.body.id}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ revoked: true });
    expect(revoked.status).toBe(201);
    expect(revoked.body).toEqual({ revoked: true });
    expect(keys.expiredApprovalKeyIds).toEqual([created.body.id]);
  });

  it('rejects a seald_live_ bearer on session routes', async () => {
    const created = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const secret = created.body.secret as string;
    const keyOnSessionRoute = await request(app.getHttpServer())
      .get('/me/api-keys')
      .set('Authorization', `Bearer ${secret}`);
    expect(keyOnSessionRoute.status).toBe(401);
    const keyOnEnvelopes = await request(app.getHttpServer())
      .get('/envelopes')
      .set('Authorization', `Bearer ${secret}`);
    expect(keyOnEnvelopes.status).toBe(401);
  });

  it('allows only one of two creates when one slot is left', async () => {
    for (let n = 0; n < 9; n += 1) {
      const made = await request(app.getHttpServer())
        .post('/me/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(made.status).toBe(201);
    }
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/me/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({}),
      request(app.getHttpServer())
        .post('/me/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({}),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const denied = first.status === 409 ? first : second;
    expect(denied.body.error).toBe('key_limit');
  });

  it('rejects a null expiry and a key without a mailbox', async () => {
    const bad = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ expires_at: null });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation_error');

    const guest = await tk.sign(
      { sub: '00000000-0000-4000-8000-00000000000c', app_metadata: { provider: 'anonymous' } },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    const rejected = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${guest}`)
      .send({});
    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toBe('email_required');
  });
});
