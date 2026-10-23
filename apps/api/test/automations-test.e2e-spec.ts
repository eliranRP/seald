import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { FakeWebhookRepo } from '../src/automations/actions/webhook/__tests__/fake-webhook-repo';
import { WebhookPgRepository } from '../src/automations/actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from '../src/automations/actions/webhook/webhook-secrets.service';
import { verifySignatureHeader } from '../src/automations/actions/webhook/webhook-signature';
import {
  WebhookActionExecutor,
  type PinnedPost,
} from '../src/automations/actions/webhook/webhook.executor';
import { pinnedPost } from '../src/automations/ssrf/pinned-request';
import { startReceiver, type TestReceiver } from '../src/automations/ssrf/__tests__/test-receiver';
import type { ResolvedAddress, WebhookResolver } from '../src/automations/ssrf/webhook-target';
import { FakeAutomationTestRepo } from '../src/automations/test-event/__tests__/fake-automation-test-repo';
import { AutomationTestRateLimiter } from '../src/automations/test-event/automation-test-rate-limiter';
import { AutomationTestRepository } from '../src/automations/test-event/automation-test.repository';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { setFlag } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * WP-29 A2b `POST /automations/:id/test`, through AppModule with in-memory
 * repos. The receiver listens on 127.0.0.1, which production blocks: the
 * recipe points at a hostname the stub resolver maps to 127.0.0.1, and the
 * test-only allowance (honoured only under NODE_ENV=test) admits exactly
 * that address, plain HTTP and the ephemeral port. `blocked.example.com`
 * resolves to 10.0.0.1, which the production denylist refuses.
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
  SIGNER_SESSION_SECRET: 'x'.repeat(64),
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
  AUTOMATION_SECRETS_KEY: '2c'.repeat(32),
};

const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const AUTO = '33333333-3333-4333-8333-333333333333';
const RECEIVER_HOST = 'hooks.receiver.test';
const ALLOWANCE = { allowHttp: true, allowAnyPort: true, allowAddresses: ['127.0.0.1'] };
/** Keeps the hanging-receiver case fast; the unit spec pins the real 10 s. */
const E2E_TOTAL_TIMEOUT_MS = 400;

const resolver: WebhookResolver = async (hostname): Promise<readonly ResolvedAddress[]> => {
  if (hostname === RECEIVER_HOST) return [{ address: '127.0.0.1', family: 4 }];
  if (hostname === 'blocked.example.com') return [{ address: '10.0.0.1', family: 4 }];
  throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
};

describe('POST /automations/:id/test (WP-29 A2b, e2e)', () => {
  let app: INestApplication;
  let rx: TestReceiver;
  let webhookRepo: FakeWebhookRepo;
  let secrets: WebhookSecretsService;
  let testRepo: FakeAutomationTestRepo;
  let sockets: number;
  let auth: { Authorization: string };
  let authOther: { Authorization: string };

  beforeAll(async () => {
    const tk = await buildTestJwks();
    rx = await startReceiver();
    webhookRepo = new FakeWebhookRepo();
    secrets = new WebhookSecretsService(webhookRepo.asRepo(), TEST_ENV, ALLOWANCE);
    testRepo = new FakeAutomationTestRepo();
    const countingPost: PinnedPost = (opts) => {
      sockets += 1;
      return pinnedPost({
        ...opts,
        totalTimeoutMs: Math.min(opts.totalTimeoutMs, E2E_TOTAL_TIMEOUT_MS),
      });
    };
    const executor = new WebhookActionExecutor(
      secrets,
      webhookRepo.asRepo(),
      TEST_ENV,
      resolver,
      ALLOWANCE,
      countingPost,
    );
    const envelopesRepo = new InMemoryEnvelopesRepository();

    const moduleRef = await stubGdriveForEnvelopeDetail(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(EnvelopeDocumentsRepository)
      .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
      .overrideProvider(ContactsRepository)
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(StorageService)
      .useValue(new InMemoryStorageService())
      .overrideProvider(OutboundEmailsRepository)
      .useValue(new InMemoryOutboundEmailsRepository())
      .overrideProvider(WebhookPgRepository)
      .useValue(webhookRepo.asRepo())
      .overrideProvider(WebhookSecretsService)
      .useValue(secrets)
      .overrideProvider(WebhookActionExecutor)
      .useValue(executor)
      .overrideProvider(AutomationTestRepository)
      .useValue(testRepo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const sign = (sub: string, email: string) =>
      tk.sign({ sub, email }, { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE });
    auth = { Authorization: `Bearer ${await sign(OWNER, 'owner@example.com')}` };
    authOther = { Authorization: `Bearer ${await sign(OTHER, 'other@example.com')}` };
  });

  beforeEach(() => {
    setFlag('workflowAutomations', true);
    testRepo.reset();
    webhookRepo.rows.clear();
    app.get(AutomationTestRateLimiter).reset();
    rx.received.length = 0;
    rx.setHandler((_r, res) => {
      res.writeHead(204);
      res.end();
    });
    sockets = 0;
    testRepo.addRecipe({ id: AUTO, ownerId: OWNER });
  });

  afterEach(() => {
    setFlag('workflowAutomations', undefined);
  });

  afterAll(async () => {
    await app.close();
    await rx.close();
  });

  const http = () => request(app.getHttpServer());
  const receiverUrl = () => `http://${RECEIVER_HOST}:${rx.port}/hooks/seald`;

  it('flag off: 404 for any id, and no request', async () => {
    const { secret } = await secrets.createSecrets(AUTO, receiverUrl());
    expect(secret).toBeTruthy();
    setFlag('workflowAutomations', false);
    const a = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(a.status).toBe(404);
    const b = await http().post('/automations/not-a-uuid/test').set(auth);
    expect(b.status).toBe(404);
    expect(rx.received).toHaveLength(0);
  });

  it('needs an owner session (401 without one)', async () => {
    const res = await http().post(`/automations/${AUTO}/test`);
    expect(res.status).toBe(401);
  });

  it("another owner's recipe is 404 and sends nothing", async () => {
    await secrets.createSecrets(AUTO, receiverUrl());
    const res = await http().post(`/automations/${AUTO}/test`).set(authOther);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(rx.received).toHaveLength(0);
    expect(sockets).toBe(0);
  });

  it('an MCP recipe waiting on approval is 409 recipe_not_approved with no network call', async () => {
    await secrets.createSecrets(AUTO, receiverUrl());
    testRepo.addApproval(AUTO, false);
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'recipe_not_approved' });
    expect(rx.received).toHaveLength(0);
    expect(sockets).toBe(0);
  });

  it('success: one signed automation.test POST, and the result comes back', async () => {
    const { secret } = await secrets.createSecrets(AUTO, receiverUrl());
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      event_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'automation.test',
      response_status: 204,
      duration_ms: expect.any(Number),
      response_truncated: false,
      error: null,
      transient: false,
    });
    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(got.headers['seald-event-id']).toBe(res.body.event_id);
    const verified = verifySignatureHeader({
      header: got.headers['seald-signature'] as string,
      rawBody: got.rawBody,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    expect(verified.ok).toBe(true);
    expect(JSON.parse(got.rawBody)).toMatchObject({
      version: 'seald.automation.v1',
      id: res.body.event_id,
      type: 'automation.test',
      test: true,
      data: { automation_id: AUTO, event_type: 'envelope.sealed' },
    });
    // The response never echoes the URL.
    expect(JSON.stringify(res.body)).not.toContain(RECEIVER_HOST);
  });

  it('SSRF: a destination resolving to 10.0.0.1 is webhook_url_blocked and opens no socket', async () => {
    await secrets.createSecrets(AUTO, 'https://blocked.example.com/hook');
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'webhook_url_blocked',
      response_status: null,
      transient: false,
    });
    expect(sockets).toBe(0);
  });

  it('timeout: a receiver that never answers is webhook_timeout (transient)', async () => {
    await secrets.createSecrets(AUTO, receiverUrl());
    rx.setHandler(() => undefined);
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'webhook_timeout',
      transient: true,
      response_status: null,
    });
    expect(res.body.duration_ms).toBeGreaterThanOrEqual(E2E_TOTAL_TIMEOUT_MS - 50);
  });

  it('a non-webhook recipe is 409 action_not_testable', async () => {
    testRepo.addRecipe({ id: AUTO, ownerId: OWNER, action: 'email_copy' });
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'action_not_testable' });
  });

  it('rate limit: the 6th test in a minute is 429 with Retry-After', async () => {
    await secrets.createSecrets(AUTO, receiverUrl());
    for (let i = 0; i < 5; i += 1) {
      expect((await http().post(`/automations/${AUTO}/test`).set(auth)).status).toBe(200);
    }
    const res = await http().post(`/automations/${AUTO}/test`).set(auth);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(rx.received).toHaveLength(5);
  });
});
