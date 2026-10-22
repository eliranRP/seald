import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { FeatureFlag } from 'shared';
import { AppModule } from '../src/app.module';
import { ApiKeyAuthService } from '../src/api-keys/api-key-auth.service';
import { ApiKeysRepository } from '../src/api-keys/api-keys.repository';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { ApprovalsRepository } from '../src/approvals/approvals.repository';
import { InMemoryApiKeysRepository } from './in-memory-api-keys-repository';
import { InMemoryApprovalsRepository } from './in-memory-approvals-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { buildTestJwks } from './test-jwks';

/**
 * WP-14: `/me/api-keys` (session only) and the credential boundary.
 *
 * - Both flags off: every key route is 404, before auth.
 * - `mcpServer` or `publicApi` on: CRUD on the Supabase session.
 * - A `seald_live_` key is never a session: 401 on `/me/api-keys` itself
 *   and on every existing `/envelopes/*`, `/me/*` and `/contacts` route;
 *   `/sign/*` answers 401 or 403.
 */
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

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const GUEST = '00000000-0000-0000-0000-00000000000c';
const ENVELOPE_ID = '11111111-1111-4111-8111-111111111111';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
function setFlags(mcpServer: boolean, publicApi: boolean): void {
  host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer, publicApi };
}

describe('/me/api-keys + API key credential boundary (e2e)', () => {
  let app: INestApplication;
  let keysRepo: InMemoryApiKeysRepository;
  let outbox: InMemoryOutboundEmailsRepository;
  let verifier: ApiKeyAuthService;
  let tokenA: string;
  let freshTokenA: string;
  let tokenB: string;
  let guestToken: string;

  beforeAll(async () => {
    const tk = await buildTestJwks();
    outbox = new InMemoryOutboundEmailsRepository();
    keysRepo = new InMemoryApiKeysRepository(outbox);
    const approvalsRepo = new InMemoryApprovalsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(ApiKeysRepository)
      .useValue(keysRepo)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbox)
      .overrideProvider(ContactsRepository)
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(EnvelopesRepository)
      .useValue(new InMemoryEnvelopesRepository())
      .overrideProvider(TemplatesRepository)
      .useValue(new InMemoryTemplatesRepository())
      // WP-21: revoke expires the key's pending approvals.
      .overrideProvider(ApprovalsRepository)
      .useValue(approvalsRepo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    verifier = app.get(ApiKeyAuthService);

    const opts = {
      issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
      audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
    };
    const nowS = Math.floor(Date.now() / 1000);
    tokenA = await tk.sign(
      {
        sub: USER_A,
        email: 'maya@example.com',
        amr: [{ method: 'password', timestamp: nowS - 7200 }],
      },
      opts,
    );
    freshTokenA = await tk.sign(
      {
        sub: USER_A,
        email: 'maya@example.com',
        amr: [{ method: 'password', timestamp: nowS - 30 }],
      },
      opts,
    );
    tokenB = await tk.sign({ sub: USER_B, email: 'b@example.com' }, opts);
    guestToken = await tk.sign({ sub: GUEST, is_anonymous: true }, opts);
  });

  beforeEach(() => {
    keysRepo.reset();
    outbox.reset();
    setFlags(true, false);
  });

  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await app.close();
  });

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const server = () => app.getHttpServer();

  async function mintKey(token = tokenA, body: object = {}): Promise<string> {
    const res = await request(server()).post('/me/api-keys').set(bearer(token)).send(body);
    expect(res.status).toBe(201);
    return res.body.secret as string;
  }

  describe('feature flag', () => {
    it('404s every route before auth when mcpServer and publicApi are both off', async () => {
      setFlags(false, false);
      for (const res of [
        await request(server()).get('/me/api-keys'),
        await request(server()).post('/me/api-keys').send({}),
        await request(server()).post(`/me/api-keys/${ENVELOPE_ID}/revoke`),
        await request(server()).get('/me/api-keys').set(bearer(tokenA)),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    });

    it('serves with publicApi alone', async () => {
      setFlags(false, true);
      const res = await request(server()).get('/me/api-keys').set(bearer(tokenA));
      expect(res.status).toBe(200);
    });

    it('MCP_DISABLED turns the routes off when only mcpServer is on', async () => {
      process.env.MCP_DISABLED = 'true';
      try {
        const res = await request(server()).get('/me/api-keys').set(bearer(tokenA));
        expect(res.status).toBe(404);
      } finally {
        delete process.env.MCP_DISABLED;
      }
    });
  });

  describe('session CRUD', () => {
    it('requires a session', async () => {
      const res = await request(server()).get('/me/api-keys');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token' });
    });

    it('POST {} creates Key 1 (envelopes:read, 90 days) and returns the secret once', async () => {
      const res = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send({});
      expect(res.status).toBe(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.secret).toMatch(/^seald_live_[A-Za-z0-9_-]{49}$/);
      expect(res.body.key).toMatchObject({
        name: 'Key 1',
        scopes: ['envelopes:read'],
        status: 'active',
        require_owner_approval: true,
      });
      const days = (Date.parse(res.body.key.expires_at) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThanOrEqual(90);

      const list = await request(server()).get('/me/api-keys').set(bearer(tokenA));
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      const listed = JSON.stringify(list.body);
      expect(listed).not.toContain(res.body.secret);
      expect(listed).not.toMatch(/key_hash|keyHash/);
      expect(listed).toContain(res.body.key.prefix);
    });

    it('enqueues the creation email without the secret', async () => {
      const res = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send({});
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0]).toMatchObject({
        kind: 'api_key_created',
        to_email: 'maya@example.com',
      });
      expect(JSON.stringify(outbox.rows[0])).not.toContain(res.body.secret);
    });

    it('rejects a null expiry, >365 days and unknown fields as validation_error', async () => {
      for (const body of [
        { expires_at: null },
        { expires_at: new Date(Date.now() + 400 * 86_400_000).toISOString() },
        { require_owner_approval: false },
      ]) {
        const res = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send(body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'validation_error' });
      }
    });

    it('rejects a guest session with no email', async () => {
      const res = await request(server()).post('/me/api-keys').set(bearer(guestToken)).send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'email_required' });
    });

    it('envelopes:send needs a sign-in within 10 minutes (amr, not iat)', async () => {
      const body = { scopes: ['envelopes:read', 'envelopes:send'] };
      // tokenA was just issued (fresh iat) but its amr is two hours old.
      const stale = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send(body);
      expect(stale.status).toBe(403);
      expect(stale.body).toEqual({ error: 'fresh_login_required' });
      const noAmr = await request(server()).post('/me/api-keys').set(bearer(tokenB)).send(body);
      expect(noAmr.status).toBe(403);
      const fresh = await request(server())
        .post('/me/api-keys')
        .set(bearer(freshTokenA))
        .send(body);
      expect(fresh.status).toBe(201);
      expect(fresh.body.key.scopes).toEqual(['envelopes:read', 'envelopes:send']);
    });

    it('caps live keys at 10', async () => {
      for (let i = 0; i < 10; i += 1) await mintKey();
      const res = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send({});
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'api_key_limit_reached' });
    });

    it('revoke keeps the row, the key stops verifying, other owners get 404', async () => {
      const created = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send({});
      const id = created.body.key.id as string;
      expect((await verifier.verify(created.body.secret)).ok).toBe(true);

      const foreign = await request(server()).post(`/me/api-keys/${id}/revoke`).set(bearer(tokenB));
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ error: 'api_key_not_found' });

      const res = await request(server()).post(`/me/api-keys/${id}/revoke`).set(bearer(tokenA));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ revoked: true });
      expect(keysRepo.rows).toHaveLength(1);
      expect(keysRepo.rows[0]?.revokedAt).not.toBeNull();
      expect(await verifier.verify(created.body.secret)).toEqual({
        ok: false,
        error: 'api_key_revoked',
      });

      const bad = await request(server())
        .post('/me/api-keys/not-a-uuid/revoke')
        .set(bearer(tokenA));
      expect(bad.status).toBe(400);
    });

    it('verify() returns { ownerId, keyId, scopes } for a minted key', async () => {
      const created = await request(server()).post('/me/api-keys').set(bearer(tokenA)).send({});
      expect(await verifier.verify(created.body.secret)).toMatchObject({
        ok: true,
        ownerId: USER_A,
        keyId: created.body.key.id,
        scopes: ['envelopes:read'],
        keyName: 'Key 1',
        keyPrefix: created.body.key.prefix,
      });
    });
  });

  describe('credential boundary: a seald_live_ key is not a session', () => {
    it('cannot manage keys (a leaked key cannot mint another)', async () => {
      const key = await mintKey(freshTokenA, {
        scopes: ['envelopes:read', 'envelopes:send', 'keys:admin'],
      });
      const before = keysRepo.rows.length;
      for (const res of [
        await request(server()).get('/me/api-keys').set(bearer(key)),
        await request(server()).post('/me/api-keys').set(bearer(key)).send({}),
        await request(server())
          .post(`/me/api-keys/${keysRepo.rows[0]?.id ?? ENVELOPE_ID}/revoke`)
          .set(bearer(key)),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'invalid_token' });
      }
      expect(keysRepo.rows.length).toBe(before);
      expect(keysRepo.rows.every((r) => r.revokedAt === null)).toBe(true);
    });

    it.each([
      ['get', '/envelopes'],
      ['post', '/envelopes'],
      ['get', `/envelopes/${ENVELOPE_ID}`],
      ['patch', `/envelopes/${ENVELOPE_ID}`],
      ['post', `/envelopes/${ENVELOPE_ID}/send`],
      ['post', `/envelopes/${ENVELOPE_ID}/signers/${ENVELOPE_ID}/remind`],
      ['get', `/envelopes/${ENVELOPE_ID}/download`],
      ['get', `/envelopes/${ENVELOPE_ID}/events`],
      ['post', `/envelopes/${ENVELOPE_ID}/cancel`],
      ['delete', `/envelopes/${ENVELOPE_ID}`],
      ['get', '/me/export'],
      ['delete', '/me'],
      ['get', '/contacts'],
      ['get', '/templates'],
      // WP-21: the owner decides on the session only; a key can never approve.
      ['get', '/approvals'],
      ['get', `/approvals/${ENVELOPE_ID}`],
      ['post', `/approvals/${ENVELOPE_ID}/approve`],
      ['post', `/approvals/${ENVELOPE_ID}/deny`],
      ['post', `/approvals/${ENVELOPE_ID}/refresh`],
    ] as const)('%s %s with a valid key is 401', async (method, path) => {
      const key = await mintKey(freshTokenA, {
        scopes: ['envelopes:read', 'envelopes:write', 'envelopes:send', 'account:admin'],
      });
      const res = await request(server())[method](path).set(bearer(key)).send({});
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_token' });
    });

    it.each([
      ['get', '/sign/me'],
      ['get', '/sign/pdf'],
      ['post', '/sign/accept-terms'],
      ['post', '/sign/submit'],
      ['post', '/sign/decline'],
    ] as const)('%s %s with a valid key is 401/403', async (method, path) => {
      const key = await mintKey();
      const res = await request(server())[method](path).set(bearer(key)).send({});
      expect([401, 403]).toContain(res.status);
    });

    it('a key presented as the /sign/start link token is refused', async () => {
      const key = await mintKey();
      const res = await request(server())
        .post('/sign/start')
        .set(bearer(key))
        .send({ envelope_id: ENVELOPE_ID, token: key });
      expect([400, 401, 403, 404]).toContain(res.status);
      expect(res.status).not.toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });
});
