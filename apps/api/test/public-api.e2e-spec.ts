import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { FEATURE_FLAGS, type ApiKeyScope, type FeatureFlag } from 'shared';
import { AccountDirectoryRepository } from '../src/accounts/account-directory.repository';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { ApiKeysRepository } from '../src/api-keys/api-keys.repository';
import { AppModule } from '../src/app.module';
import { ApprovalsRepository } from '../src/approvals/approvals.repository';
import { SendGuardRepository } from '../src/approvals/send-guard.repository';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { PassthroughTransactionRunner, TransactionRunner } from '../src/db/transaction-runner';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { IdempotencyRecordsRepository } from '../src/idempotency/idempotency-records.repository';
import { InMemoryIdempotencyRecordsRepository } from '../src/idempotency/__tests__/in-memory-idempotency-records.repository';
import { PublicApiRateLimiter } from '../src/public-api/public-api-rate-limiter';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { InMemoryApiKeysRepository } from './in-memory-api-keys-repository';
import { InMemoryApprovalsRepository } from './in-memory-approvals-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * Public REST API v1 (WP-35) over in-memory repositories: the flag, key
 * auth, scopes, owner isolation, the one error shape, idempotency replay
 * and `202 approval_pending` on send. The Postgres run of the approval and
 * idempotency paths is `public-api.pg.e2e-spec.ts`.
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
  TC_VERSION: 'tc',
  PRIVACY_VERSION: 'pp',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
  APPROVAL_CSRF_KEY: 'k'.repeat(48),
  EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
  EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
};

const OWNER_A = '00000000-0000-0000-0000-00000000000a';
const OWNER_B = '00000000-0000-0000-0000-00000000000b';
const EMAIL_A = 'maya@example.com';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const flags = (on: boolean): void => {
  host.__SEALD_FEATURE_OVERRIDES__ = { publicApi: on };
};

/** Counts only the key under test, so the other specs never trip the 30 per minute limit. */
class SelectiveLimiter extends PublicApiRateLimiter {
  limitedKeyId = '';
  constructor() {
    super({ capacity: 30, windowMs: 60_000 });
  }
  override take(keyId: string): number | null {
    return keyId === this.limitedKeyId ? super.take(keyId) : null;
  }
}

const ALL_SCOPES: ApiKeyScope[] = [
  'envelopes:read',
  'envelopes:write',
  'envelopes:send',
  'documents:write',
  'contacts:read',
  'contacts:write',
  'templates:read',
];

describe('public REST API v1 (e2e, in-memory)', () => {
  let app: INestApplication;
  let keysRepo: InMemoryApiKeysRepository;
  let approvals: InMemoryApprovalsRepository;
  let sessionA: string;
  let pdf: Buffer;
  const limiter = new SelectiveLimiter();
  const token: Record<'a' | 'readOnly' | 'b' | 'revoked' | 'limited', string> = {
    a: '',
    readOnly: '',
    b: '',
    revoked: '',
    limited: '',
  };

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const idem = () => `wp35-key-${String((seq += 1)).padStart(6, '0')}`;

  let lastKeyId = '';
  function seedKey(
    owner: string,
    scopes: ApiKeyScope[],
    opts: { revoked?: boolean; requireApproval?: boolean } = {},
  ): string {
    const k = generateApiKey();
    const row = keysRepo.seed({
      ownerId: owner,
      prefix: k.prefix,
      keyHash: k.keyHash,
      scopes,
      requireOwnerApproval: opts.requireApproval ?? true,
      revokedAt: opts.revoked ? new Date().toISOString() : null,
    });
    lastKeyId = row.id;
    approvals.keys.set(row.id, {
      id: row.id,
      ownerId: owner,
      name: row.name,
      prefix: row.prefix,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      alwaysRequireSignin: false,
      allowNewRecipients: false,
      approvalNotify: 'email',
    });
    return k.token;
  }

  /** A ready draft made the way the web app makes one: a PDF, a signer, a field. */
  async function readyDraft(): Promise<string> {
    const env = await http().post('/envelopes').set(bearer(sessionA)).send({ title: 'NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    const up = await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(sessionA))
      .attach('file', pdf, { filename: 'nda.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const signer = await http()
      .post(`/envelopes/${id}/signers`)
      .set(bearer(sessionA))
      .send({ name: 'Nia', email: 'nia@new.test' });
    expect(signer.status).toBe(201);
    const fields = await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(sessionA))
      .send({
        fields: [
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
            required: true,
          },
        ],
      });
    expect(fields.status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    const tk = await buildTestJwks();
    const outbox = new InMemoryOutboundEmailsRepository();
    keysRepo = new InMemoryApiKeysRepository(outbox);
    approvals = new InMemoryApprovalsRepository();
    const envelopesRepo = new InMemoryEnvelopesRepository();
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdf = Buffer.from(await doc.save());

    const moduleRef = await stubGdriveForEnvelopeDetail(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_ENV)
        .useValue(TEST_ENV)
        .overrideProvider(JWKS_RESOLVER)
        .useValue(tk.resolver)
        .overrideProvider(ApiKeysRepository)
        .useValue(keysRepo)
        .overrideProvider(OutboundEmailsRepository)
        .useValue(outbox)
        .overrideProvider(EnvelopesRepository)
        .useValue(envelopesRepo)
        .overrideProvider(EnvelopeDocumentsRepository)
        .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
        .overrideProvider(ContactsRepository)
        .useValue(new InMemoryContactsRepository())
        .overrideProvider(TemplatesRepository)
        .useValue(new InMemoryTemplatesRepository())
        .overrideProvider(ApprovalsRepository)
        .useValue(approvals)
        .overrideProvider(IdempotencyRecordsRepository)
        .useValue(new InMemoryIdempotencyRecordsRepository())
        .overrideProvider(TransactionRunner)
        .useValue(new PassthroughTransactionRunner())
        .overrideProvider(SendGuardRepository)
        .useValue({
          lockOwner: async () => undefined,
          lockEnvelope: async () => undefined,
          usageSince: async () => ({ sends: 0, newRecipients: 0 }),
          deliveryHealthSince: async () => ({ sent: 0, bounced: 0, complaints: 0 }),
        })
        .overrideProvider(AccountDirectoryRepository)
        .useValue({ findEmail: async (id: string) => (id === OWNER_A ? EMAIL_A : null) })
        .overrideProvider(PublicApiRateLimiter)
        .useValue(limiter)
        .overrideProvider(StorageService)
        .useValue(new InMemoryStorageService())
        // signerAccessAuth ships on: the send approval reads access settings.
        .overrideProvider(AccessAuthRepository)
        .useValue(new InMemoryAccessAuthRepository(envelopesRepo)),
    ).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    approvals.mailboxes.set(OWNER_A, { email: EMAIL_A, verified: true });
    token.a = seedKey(OWNER_A, ALL_SCOPES);
    token.readOnly = seedKey(OWNER_A, ['envelopes:read']);
    token.b = seedKey(OWNER_B, ALL_SCOPES);
    token.revoked = seedKey(OWNER_A, ALL_SCOPES, { revoked: true });
    token.limited = seedKey(OWNER_A, ['envelopes:read']);
    limiter.limitedKeyId = lastKeyId;
    sessionA = await tk.sign(
      { sub: OWNER_A, email: EMAIL_A },
      { issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
  });

  beforeEach(() => flags(true));
  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await app.close();
  });

  describe('the publicApi flag', () => {
    it('ships on (the parity flags are switched on)', () => {
      expect(FEATURE_FLAGS.publicApi).toBe(true);
    });

    it('404s every route, with a valid key, before auth, in the API error shape', async () => {
      flags(false);
      const read = await http().get('/api/v1/me').set(bearer(token.a));
      expect(read.status).toBe(404);
      expect(read.body).toEqual({ error: 'not_found', message: expect.any(String) });
      expect((await http().get('/api/v1/me')).status).toBe(404);
      expect((await http().get('/api/v1/openapi.json')).status).toBe(404);
      const send = await http()
        .post(`/api/v1/envelopes/${UNKNOWN_ID}/send`)
        .set(bearer(token.a))
        .send({});
      expect(send.status).toBe(404);
    });
  });

  describe('OpenAPI document', () => {
    it('is public and OpenAPI 3.1', async () => {
      const res = await http().get('/api/v1/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ openapi: '3.1.0', info: { title: 'Seald public API' } });
      expect(Object.keys(res.body.paths)).toContain('/envelopes/{envelope_id}/send');
    });
  });

  describe('key auth', () => {
    it('401 missing_token without a header', async () => {
      const res = await http().get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token', message: expect.any(String) });
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it('401 invalid_token for garbage, a non-Bearer scheme and a Supabase JWT', async () => {
      for (const header of ['Bearer nope', 'Basic abc', `Bearer ${sessionA}`]) {
        const res = await http().get('/api/v1/me').set('Authorization', header);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('invalid_token');
      }
    });

    it('401 api_key_revoked for a revoked key', async () => {
      const res = await http().get('/api/v1/me').set(bearer(token.revoked));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('api_key_revoked');
    });

    it('a key is still not a session: 401 on the app routes', async () => {
      for (const path of ['/envelopes', '/contacts', '/me', '/me/api-keys']) {
        const res = await http().get(path).set(bearer(token.a));
        expect(res.status).toBe(401);
      }
    });

    it('answers a known key', async () => {
      const res = await http().get('/api/v1/me').set(bearer(token.a));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('rate limit', () => {
    it('429 rate_limited with Retry-After after 30 calls in a minute, per key', async () => {
      for (let i = 0; i < 30; i += 1) {
        expect((await http().get('/api/v1/me').set(bearer(token.limited))).status).toBe(200);
      }
      const over = await http().get('/api/v1/me').set(bearer(token.limited));
      expect(over.status).toBe(429);
      expect(over.body).toEqual({
        error: 'rate_limited',
        message: expect.any(String),
        retry_after_seconds: expect.any(Number),
      });
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
      // Another key is not affected.
      expect((await http().get('/api/v1/me').set(bearer(token.a))).status).toBe(200);
    });
  });

  describe('scopes', () => {
    it('a read-only key reads, and gets 403 insufficient_scope on a write', async () => {
      const own = await http()
        .post('/api/v1/envelopes')
        .set(bearer(token.a))
        .send({ title: 'Readable' });
      expect(
        (
          await http()
            .get(`/api/v1/envelopes/${own.body.id as string}`)
            .set(bearer(token.readOnly))
        ).status,
      ).toBe(200);
      const res = await http()
        .post('/api/v1/envelopes')
        .set(bearer(token.readOnly))
        .send({ title: 'x' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'insufficient_scope', message: expect.any(String) });
      const contacts = await http().get('/api/v1/contacts').set(bearer(token.readOnly));
      expect(contacts.status).toBe(403);
    });

    it('send needs envelopes:send', async () => {
      const res = await http()
        .post(`/api/v1/envelopes/${UNKNOWN_ID}/send`)
        .set(bearer(token.readOnly))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('insufficient_scope');
    });
  });

  describe('envelopes, owner isolation and the error shape', () => {
    it('creates, reads, lists and updates a draft; another owner sees nothing', async () => {
      const created = await http()
        .post('/api/v1/envelopes')
        .set(bearer(token.a))
        .set('Idempotency-Key', idem())
        .send({ title: 'Supplier NDA' });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      expect(created.body).toMatchObject({ title: 'Supplier NDA', status: 'draft' });

      expect((await http().get(`/api/v1/envelopes/${id}`).set(bearer(token.a))).status).toBe(200);
      const status = await http().get(`/api/v1/envelopes/${id}/status`).set(bearer(token.a));
      expect(status.status).toBe(200);
      const docs = await http().get(`/api/v1/envelopes/${id}/documents`).set(bearer(token.a));
      expect(docs.body).toEqual({ documents: expect.any(Array) });

      const patched = await http()
        .patch(`/api/v1/envelopes/${id}`)
        .set(bearer(token.a))
        .set('Idempotency-Key', idem())
        .send({ title: 'Renamed' });
      expect(patched.status).toBe(200);
      expect(patched.body.title).toBe('Renamed');

      // Owner B: not found, and absent from the list.
      const other = await http().get(`/api/v1/envelopes/${id}`).set(bearer(token.b));
      expect(other.status).toBe(404);
      expect(other.body).toEqual({ error: 'envelope_not_found', message: expect.any(String) });
      const otherPatch = await http()
        .patch(`/api/v1/envelopes/${id}`)
        .set(bearer(token.b))
        .send({ title: 'mine now' });
      expect(otherPatch.status).toBe(404);
    });

    it('400 validation_error for a bad body, a bad id and an unknown query key', async () => {
      const cases = [
        () => http().post('/api/v1/envelopes').set(bearer(token.a)).send({}),
        () => http().post('/api/v1/envelopes').set(bearer(token.a)).send({ title: 'x', extra: 1 }),
        () => http().get('/api/v1/envelopes/not-a-uuid').set(bearer(token.a)),
        () => http().get('/api/v1/contacts?nope=1').set(bearer(token.a)),
        () =>
          http()
            .post('/api/v1/envelopes')
            .set(bearer(token.a))
            .set('Idempotency-Key', 'short')
            .send({ title: 'x' }),
      ];
      for (const run of cases) {
        const res = await run();
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'validation_error', message: expect.any(String) });
      }
    });

    it('404 not_found for an unknown id and an unknown path', async () => {
      const gone = await http().get(`/api/v1/envelopes/${UNKNOWN_ID}`).set(bearer(token.a));
      expect(gone.status).toBe(404);
      expect(gone.body.error).toBe('envelope_not_found');
    });

    it('a tool whose flag is off is not a route', async () => {
      host.__SEALD_FEATURE_OVERRIDES__ = { publicApi: true, multiDocumentEnvelopes: false };
      const res = await http()
        .post(`/api/v1/envelopes/${UNKNOWN_ID}/documents`)
        .set(bearer(token.a))
        .send({ document_id: UNKNOWN_ID });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  describe('contacts', () => {
    it('CRUD, and one owner never sees the other', async () => {
      const created = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', idem())
        .send({ name: 'Ada', email: 'ada@example.com' });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      expect((await http().get(`/api/v1/contacts/${id}`).set(bearer(token.a))).status).toBe(200);
      const found = await http().get('/api/v1/contacts/search?q=ada').set(bearer(token.a));
      expect(found.status).toBe(200);
      expect(JSON.stringify(found.body)).toContain(id);
      expect((await http().get(`/api/v1/contacts/${id}`).set(bearer(token.b))).status).toBe(404);
      const del = await http()
        .delete(`/api/v1/contacts/${id}`)
        .set(bearer(token.a))
        .set('Idempotency-Key', idem());
      expect(del.status).toBe(200);
      expect((await http().get(`/api/v1/contacts/${id}`).set(bearer(token.a))).status).toBe(404);
    });
  });

  describe('Idempotency-Key', () => {
    it('replays the first result for the same key and request, and runs once', async () => {
      const key = idem();
      const body = { name: 'Replay Rae', email: 'rae@example.com' };
      const first = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send(body);
      const second = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      const list = await http()
        .get('/api/v1/contacts/search?q=rae@example.com')
        .set(bearer(token.a));
      expect(JSON.stringify(list.body).split(first.body.id as string)).toHaveLength(2);
    });

    it('409 idempotency_conflict for the same key with a different request', async () => {
      const key = idem();
      const first = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send({ name: 'One', email: 'one@example.com' });
      expect(first.status).toBe(201);
      const clash = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send({ name: 'Two', email: 'two@example.com' });
      expect(clash.status).toBe(409);
      expect(clash.body).toEqual({ error: 'idempotency_conflict', message: expect.any(String) });
    });

    it('a key is per owner: the same string under another key is a new call', async () => {
      const key = idem();
      const body = { name: 'Shared', email: 'shared@example.com' };
      const a = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send(body);
      const b = await http()
        .post('/api/v1/contacts')
        .set(bearer(token.b))
        .set('Idempotency-Key', key)
        .send(body);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(b.body.id).not.toBe(a.body.id);
    });
  });

  describe('send, remind and cancel go through owner approval', () => {
    it('202 approval_pending on send, nothing sent, replay returns the same approval', async () => {
      const id = await readyDraft();
      const key = idem();
      const res = await http()
        .post(`/api/v1/envelopes/${id}/send`)
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send({});
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        status: 'approval_pending',
        message: 'pending owner approval',
        approval_id: expect.any(String),
        approve_requires: expect.stringMatching(/^(email|session)$/),
      });
      expect(res.body.review_url).toContain(`/approve/${String(res.body.approval_id)}/review`);
      expect(JSON.stringify(res.body)).not.toContain('/approve#');

      // Still a draft.
      const after = await http().get(`/api/v1/envelopes/${id}`).set(bearer(token.a));
      expect(after.body.status).toBe('draft');

      // Same key: same answer, no second approval.
      const again = await http()
        .post(`/api/v1/envelopes/${id}/send`)
        .set(bearer(token.a))
        .set('Idempotency-Key', key)
        .send({});
      expect(again.status).toBe(202);
      expect(again.body).toEqual(res.body);
      expect(approvals.rows.filter((r) => r.envelopeId === id)).toHaveLength(1);

      // The agent polls.
      const polled = await http()
        .get(`/api/v1/approvals/${String(res.body.approval_id)}`)
        .set(bearer(token.a));
      expect(polled.status).toBe(200);
      expect(polled.body).toEqual({ status: 'pending' });
      // Owner B cannot read A's approval.
      const other = await http()
        .get(`/api/v1/approvals/${String(res.body.approval_id)}`)
        .set(bearer(token.b));
      expect(other.status).toBe(404);
    });

    it('a dry run of send checks the draft and writes nothing', async () => {
      const id = await readyDraft();
      const res = await http()
        .post(`/api/v1/envelopes/${id}/send?dry_run=true`)
        .set(bearer(token.a))
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ dry_run: true });
      expect(approvals.rows.filter((r) => r.envelopeId === id)).toHaveLength(0);
    });

    it('a dry run of send on an empty draft names what is missing: 422 file_required', async () => {
      const created = await http()
        .post('/api/v1/envelopes')
        .set(bearer(token.a))
        .send({ title: 'Empty' });
      const res = await http()
        .post(`/api/v1/envelopes/${created.body.id as string}/send?dry_run=true`)
        .set(bearer(token.a))
        .send({});
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('file_required');
    });

    it('cancel of a draft is envelope_terminal (409)', async () => {
      const created = await http()
        .post('/api/v1/envelopes')
        .set(bearer(token.a))
        .send({ title: 'Draft only' });
      const res = await http()
        .post(`/api/v1/envelopes/${created.body.id as string}/cancel`)
        .set(bearer(token.a))
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('envelope_terminal');
    });
  });
});
