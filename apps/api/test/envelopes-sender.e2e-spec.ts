import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

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
  EMAIL_LEGAL_ENTITY: 'Seald, Inc.',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

// Use valid v4 UUIDs (version nibble must be 1–8) so auth runs before any
// ParseUUIDPipe rejection — otherwise bad-uuid 400 masks the 401 we want to assert.
const ENV_ID = '11111111-1111-4111-8111-111111111111';
const SGN_ID = '22222222-2222-4222-8222-22222222222f';
const PROTECTED_ROUTES = [
  ['GET', '/envelopes'],
  ['POST', '/envelopes'],
  ['GET', `/envelopes/${ENV_ID}`],
  ['PATCH', `/envelopes/${ENV_ID}`],
  ['DELETE', `/envelopes/${ENV_ID}`],
  ['POST', `/envelopes/${ENV_ID}/upload`],
  ['POST', `/envelopes/${ENV_ID}/send`],
  ['POST', `/envelopes/${ENV_ID}/signers`],
  ['POST', `/envelopes/${ENV_ID}/signers/${SGN_ID}/remind`],
  ['DELETE', `/envelopes/${ENV_ID}/signers/${SGN_ID}`],
  ['PUT', `/envelopes/${ENV_ID}/fields`],
  ['GET', `/envelopes/${ENV_ID}/events`],
] as const;

describe('Envelopes — sender auth contract (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    contactsRepo = new InMemoryContactsRepository();
    storage = new InMemoryStorageService();
    outbound = new InMemoryOutboundEmailsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    envelopesRepo.reset();
    contactsRepo.reset();
    storage.reset();
    outbound.reset();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(PROTECTED_ROUTES)(
    '%s %s without Authorization → 401 missing_token',
    async (method, url) => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](url);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token' });
    },
  );
});

describe('Envelopes — sender draft flow (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tokenB: string;
  let tinyPdf: Buffer;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    contactsRepo = new InMemoryContactsRepository();
    storage = new InMemoryStorageService();
    outbound = new InMemoryOutboundEmailsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const signOpts = { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE };
    tokenA = await tk.sign({ sub: USER_A, email: 'sender-a@example.com' }, signOpts);
    tokenB = await tk.sign({ sub: USER_B, email: 'sender-b@example.com' }, signOpts);

    // Produce a small but structurally-valid PDF for upload tests.
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    doc.addPage([300, 200]);
    tinyPdf = Buffer.from(await doc.save());
  });

  beforeEach(() => {
    envelopesRepo.reset();
    contactsRepo.reset();
    storage.reset();
    outbound.reset();
  });
  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('POST /envelopes creates a draft with defaults + created event', async () => {
    const res = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'NDA v1' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      owner_id: USER_A,
      title: 'NDA v1',
      status: 'draft',
      delivery_mode: 'parallel',
      tc_version: TEST_ENV.TC_VERSION,
      privacy_version: TEST_ENV.PRIVACY_VERSION,
    });
    expect(res.body.short_code).toHaveLength(13);
    expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const events = envelopesRepo.events.filter((e) => e.envelope_id === res.body.id);
    expect(events.map((e) => e.event_type)).toEqual(['created']);
  });

  it('POST /envelopes rejects empty title with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('POST /envelopes rejects unknown field with 400 (DTO whitelist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'X', owner_id: USER_B });
    expect(res.status).toBe(400);
  });

  it('GET /envelopes lists only caller envelopes', async () => {
    await request(app.getHttpServer()).post('/envelopes').set(auth(tokenA)).send({ title: 'A1' });
    await request(app.getHttpServer()).post('/envelopes').set(auth(tokenA)).send({ title: 'A2' });
    await request(app.getHttpServer()).post('/envelopes').set(auth(tokenB)).send({ title: 'B1' });

    const listA = await request(app.getHttpServer()).get('/envelopes').set(auth(tokenA));
    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(2);
    expect(listA.body.items.every((e: { status: string }) => e.status === 'draft')).toBe(true);

    const listB = await request(app.getHttpServer()).get('/envelopes').set(auth(tokenB));
    expect(listB.body.items).toHaveLength(1);
  });

  it('GET /envelopes/:id returns envelope for owner, 404 for other user', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Owned' });
    const good = await request(app.getHttpServer())
      .get(`/envelopes/${created.body.id}`)
      .set(auth(tokenA));
    expect(good.status).toBe(200);
    expect(good.body.id).toBe(created.body.id);

    const bad = await request(app.getHttpServer())
      .get(`/envelopes/${created.body.id}`)
      .set(auth(tokenB));
    expect(bad.status).toBe(404);
    expect(bad.body).toEqual({ error: 'envelope_not_found' });
  });

  it('GET /envelopes/:id with malformed uuid → 400', async () => {
    const res = await request(app.getHttpServer()).get('/envelopes/not-a-uuid').set(auth(tokenA));
    expect(res.status).toBe(400);
  });

  it('PATCH /envelopes/:id updates title on draft; rejects empty body', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Original' });

    const empty = await request(app.getHttpServer())
      .patch(`/envelopes/${created.body.id}`)
      .set(auth(tokenA))
      .send({});
    expect(empty.status).toBe(400);

    const updated = await request(app.getHttpServer())
      .patch(`/envelopes/${created.body.id}`)
      .set(auth(tokenA))
      .send({ title: 'Updated' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Updated');
  });

  it('DELETE /envelopes/:id removes a draft; 404 for cross-owner', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'To delete' });

    const badOwner = await request(app.getHttpServer())
      .delete(`/envelopes/${created.body.id}`)
      .set(auth(tokenB));
    expect(badOwner.status).toBe(404);

    const del = await request(app.getHttpServer())
      .delete(`/envelopes/${created.body.id}`)
      .set(auth(tokenA));
    expect(del.status).toBe(204);

    const after = await request(app.getHttpServer())
      .get(`/envelopes/${created.body.id}`)
      .set(auth(tokenA));
    expect(after.status).toBe(404);
  });

  it('POST /envelopes/:id/upload validates, uploads PDF, records hash + pages', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Upload target' });

    const res = await request(app.getHttpServer())
      .post(`/envelopes/${created.body.id}/upload`)
      .set(auth(tokenA))
      .attach('file', tinyPdf, { filename: 'tiny.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.pages).toBe(2);
    expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Object landed in storage at the expected key
    const expectedKey = `${created.body.id}/original.pdf`;
    expect(storage.allPaths()).toContain(expectedKey);
    const stored = storage.get(expectedKey);
    expect(stored?.contentType).toBe('application/pdf');
    expect(stored?.bytes.length).toBe(tinyPdf.length);

    // Envelope row is stamped
    const detail = await request(app.getHttpServer())
      .get(`/envelopes/${created.body.id}`)
      .set(auth(tokenA));
    expect(detail.body.original_pages).toBe(2);
    expect(detail.body.original_sha256).toBe(res.body.sha256);
  });

  it('POST /envelopes/:id/upload rejects non-PDF bytes with 415 file_not_pdf', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Upload target' });

    const res = await request(app.getHttpServer())
      .post(`/envelopes/${created.body.id}/upload`)
      .set(auth(tokenA))
      .attach('file', Buffer.from('not a pdf at all'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'file_not_pdf' });
  });

  it('POST /envelopes/:id/upload with no file → 400 file_required', async () => {
    const created = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Upload target' });

    const res = await request(app.getHttpServer())
      .post(`/envelopes/${created.body.id}/upload`)
      .set(auth(tokenA));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'file_required' });
  });

  it('POST /envelopes/:id/signers snapshots contact; rejects unknown contact; 409 on duplicate', async () => {
    // Seed a contact for USER_A
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      color: '#112233',
    });

    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Signers' });

    // Unknown contact id → 404 (UUID must have valid version nibble 1–8)
    const bogus = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth(tokenA))
      .send({ contact_id: '11111111-1111-4111-8111-111111111199' });
    expect(bogus.status).toBe(404);
    expect(bogus.body).toEqual({ error: 'contact_not_found' });

    // Happy path
    const addA = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth(tokenA))
      .send({ contact_id: contact.id });
    expect(addA.status).toBe(201);
    expect(addA.body).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      color: '#112233',
      role: 'signatory',
      status: 'awaiting',
    });

    // Duplicate contact → 409 signer_email_taken
    const dup = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth(tokenA))
      .send({ contact_id: contact.id });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: 'signer_email_taken' });
  });

  it('PUT /envelopes/:id/fields rejects signer_id not in envelope', async () => {
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });

    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Fields' });
    const signer = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth(tokenA))
      .send({ contact_id: contact.id });

    // Using wrong signer_id → 400 signer_not_in_envelope (valid-v4 UUID)
    const bad = await request(app.getHttpServer())
      .put(`/envelopes/${env.body.id}/fields`)
      .set(auth(tokenA))
      .send({
        fields: [
          {
            signer_id: '22222222-2222-4222-8222-22222222eeee',
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1,
            required: true,
          },
        ],
      });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'signer_not_in_envelope' });

    // Valid fields → 200
    const good = await request(app.getHttpServer())
      .put(`/envelopes/${env.body.id}/fields`)
      .set(auth(tokenA))
      .send({
        fields: [
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.2,
            width: 0.2,
            height: 0.05,
            required: true,
          },
          {
            signer_id: signer.body.id,
            kind: 'date',
            page: 1,
            x: 0.4,
            y: 0.2,
            required: true,
          },
        ],
      });
    expect(good.status).toBe(200);
    expect(good.body.fields).toHaveLength(2);
  });

  it('full happy path — create → upload → add signer → place fields → fetch full envelope', async () => {
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Full flow' });

    await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/upload`)
      .set(auth(tokenA))
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });

    const signer = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth(tokenA))
      .send({ contact_id: contact.id });

    await request(app.getHttpServer())
      .put(`/envelopes/${env.body.id}/fields`)
      .set(auth(tokenA))
      .send({
        fields: [
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.5,
            y: 0.5,
            required: true,
          },
        ],
      });

    const full = await request(app.getHttpServer())
      .get(`/envelopes/${env.body.id}`)
      .set(auth(tokenA));
    expect(full.status).toBe(200);
    expect(full.body.original_pages).toBe(2);
    expect(full.body.signers).toHaveLength(1);
    expect(full.body.fields).toHaveLength(1);
    expect(full.body.status).toBe('draft');
  });

  it('GET /envelopes/:id/events returns the audit stream for owner', async () => {
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Events' });
    await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/upload`)
      .set(auth(tokenA))
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });

    const evs = await request(app.getHttpServer())
      .get(`/envelopes/${env.body.id}/events`)
      .set(auth(tokenA));
    expect(evs.status).toBe(200);
    // Two 'created' events — one from draft creation, one from upload commit.
    expect(evs.body.events).toHaveLength(2);
    expect(evs.body.events[1].metadata).toMatchObject({ pages: 2 });

    // Cross-owner → 404
    const blocked = await request(app.getHttpServer())
      .get(`/envelopes/${env.body.id}/events`)
      .set(auth(tokenB));
    expect(blocked.status).toBe(404);
  });

  describe('POST /envelopes/:id/send', () => {
    async function buildCompleteDraft(): Promise<{ envId: string; signerId: string }> {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'Ready to send' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth(tokenA))
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(tokenA))
        .send({ contact_id: contact.id });
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth(tokenA))
        .send({
          fields: [
            {
              signer_id: signer.body.id,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.1,
              required: true,
            },
          ],
        });
      return { envId: env.body.id, signerId: signer.body.id };
    }

    it('transitions draft → awaiting_others, enqueues one invite per signer, writes sent events', async () => {
      const { envId, signerId } = await buildCompleteDraft();

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(tokenA));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('awaiting_others');
      expect(res.body.sent_at).toBeTruthy();

      // Exactly one invite queued for the one signer.
      const queued = outbound.rows.filter((r) => r.envelope_id === envId);
      expect(queued).toHaveLength(1);
      expect(queued[0]!.kind).toBe('invite');
      expect(queued[0]!.signer_id).toBe(signerId);
      expect(queued[0]!.to_email).toBe('ada@example.com');
      expect(queued[0]!.payload).toMatchObject({
        envelope_title: 'Ready to send',
        short_code: res.body.short_code,
      });
      // Token is NOT hashed in the payload — it's embedded in the sign_url.
      expect(String(queued[0]!.payload.sign_url)).toMatch(/\?t=[A-Za-z0-9_-]{43}$/);

      // sent event present per signer.
      const eventsRes = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/events`)
        .set(auth(tokenA));
      const sentEvents = eventsRes.body.events.filter(
        (e: { event_type: string }) => e.event_type === 'sent',
      );
      expect(sentEvents).toHaveLength(1);
    });

    it('rejects with 400 file_required when no PDF uploaded', async () => {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'No file' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(tokenA))
        .send({ contact_id: contact.id });
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth(tokenA))
        .send({
          fields: [
            {
              signer_id: signer.body.id,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.1,
              required: true,
            },
          ],
        });

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/send`)
        .set(auth(tokenA));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'file_required' });
    });

    it('rejects with 400 no_signers when signer list is empty', async () => {
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'No signers' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth(tokenA))
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/send`)
        .set(auth(tokenA));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'no_signers' });
    });

    it('rejects with 400 signer_without_signature_field when a signer has no required sig field', async () => {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'Bad fields' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth(tokenA))
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(tokenA))
        .send({ contact_id: contact.id });
      // Date field only — no signature/initials for this signer.
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth(tokenA))
        .send({
          fields: [
            { signer_id: signer.body.id, kind: 'date', page: 1, x: 0.1, y: 0.1, required: true },
          ],
        });

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/send`)
        .set(auth(tokenA));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'signer_without_signature_field' });
    });

    it('rejects with 409 envelope_not_draft on re-send', async () => {
      const { envId } = await buildCompleteDraft();
      const first = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(tokenA));
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(tokenA));
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'envelope_not_draft' });
    });

    it('cross-owner send → 404 envelope_not_found', async () => {
      const { envId } = await buildCompleteDraft();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(tokenB));
      expect(res.status).toBe(404);
    });

    it('once sent, further draft mutations (patch/delete/signers/fields/upload) return 409', async () => {
      const { envId } = await buildCompleteDraft();
      await request(app.getHttpServer()).post(`/envelopes/${envId}/send`).set(auth(tokenA));

      const patch = await request(app.getHttpServer())
        .patch(`/envelopes/${envId}`)
        .set(auth(tokenA))
        .send({ title: 'new' });
      expect(patch.status).toBe(409);

      const del = await request(app.getHttpServer())
        .delete(`/envelopes/${envId}`)
        .set(auth(tokenA));
      expect(del.status).toBe(409);
    });
  });

  describe('POST /envelopes/:id/signers/:signer_id/remind', () => {
    async function buildSentEnvelope(): Promise<{ envId: string; signerId: string }> {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'Remind me' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth(tokenA))
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(tokenA))
        .send({ contact_id: contact.id });
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth(tokenA))
        .send({
          fields: [
            {
              signer_id: signer.body.id,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.1,
              required: true,
            },
          ],
        });
      await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth(tokenA));
      return { envId: env.body.id, signerId: signer.body.id };
    }

    it('throttles reminder within 1 hour of the invite → 429 remind_throttled', async () => {
      const { envId, signerId } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/signers/${signerId}/remind`)
        .set(auth(tokenA));
      expect(res.status).toBe(429);
      expect(res.body).toEqual({ error: 'remind_throttled' });
    });

    it('succeeds when the last invite/reminder is older than 1 hour — returns 202, enqueues reminder', async () => {
      const { envId, signerId } = await buildSentEnvelope();
      // Age the outbound rows by rewriting created_at — simulates "more than 1 hour ago".
      for (const row of outbound.rows) {
        (row as { created_at: string }).created_at = new Date(
          Date.now() - 65 * 60 * 1000,
        ).toISOString();
      }

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/signers/${signerId}/remind`)
        .set(auth(tokenA));
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ status: 'queued' });

      const reminders = outbound.rows.filter((r) => r.kind === 'reminder');
      expect(reminders).toHaveLength(1);
      expect(reminders[0]!.to_email).toBe('ada@example.com');
      // Reminder carries a fresh token — the rotated one
      expect(String(reminders[0]!.payload.sign_url)).toMatch(/\?t=[A-Za-z0-9_-]{43}$/);
      expect(String(reminders[0]!.payload.envelope_title)).toBe('Remind me');
      expect(String(reminders[0]!.payload.expires_at_readable)).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
      );

      // An audit event was written alongside.
      const events = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/events`)
        .set(auth(tokenA));
      expect(
        events.body.events.filter((e: { event_type: string }) => e.event_type === 'reminder_sent'),
      ).toHaveLength(1);
    });

    it('409 envelope_terminal when envelope is still draft (never sent)', async () => {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(tokenA))
        .send({ title: 'Draft' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(tokenA))
        .send({ contact_id: contact.id });

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers/${signer.body.id}/remind`)
        .set(auth(tokenA));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'envelope_terminal' });
    });

    it('404 envelope_not_found on unknown signer for an owned envelope', async () => {
      const { envId } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/signers/22222222-2222-4222-8222-2222222200ff/remind`)
        .set(auth(tokenA));
      expect(res.status).toBe(404);
    });

    it('cross-owner reminder → 404 envelope_not_found', async () => {
      const { envId, signerId } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/signers/${signerId}/remind`)
        .set(auth(tokenB));
      expect(res.status).toBe(404);
    });
  });

  /**
   * Guest mode in the SPA exchanges the localStorage flag for an anonymous
   * Supabase session, so the JWT carries `sub` but no `email`. The send /
   * remind endpoints accept the sender's email in the request body for
   * exactly this case (controller resolves JWT-email-wins; body email used
   * only when JWT email is null). These tests cover the wire contract end
   * to end so the no-sign-up flow actually persists envelopes + queues
   * invite emails.
   */
  describe('anon (guest) send + remind via body sender_email', () => {
    let anonToken: string;

    beforeAll(async () => {
      const signOpts = { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE };
      // No `email` claim — mirrors a Supabase anonymous sign-in.
      anonToken = await tk.sign({ sub: USER_A }, signOpts);
    });

    async function buildAnonDraft(): Promise<{ envId: string; signerId: string }> {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Bea',
        email: 'bea@example.com',
        color: '#abcdef',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth(anonToken))
        .send({ title: 'Guest send' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth(anonToken))
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
      const signer = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth(anonToken))
        .send({ contact_id: contact.id });
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth(anonToken))
        .send({
          fields: [
            {
              signer_id: signer.body.id,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.1,
              required: true,
            },
          ],
        });
      return { envId: env.body.id, signerId: signer.body.id };
    }

    it('POST /:id/send with body sender_email creates envelope + enqueues invite', async () => {
      const { envId, signerId } = await buildAnonDraft();

      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(anonToken))
        .send({ sender_email: 'guest@example.com', sender_name: 'Guest User' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('awaiting_others');
      expect(res.body.sender_email).toBe('guest@example.com');
      expect(res.body.sender_name).toBe('Guest User');

      const queued = outbound.rows.filter((r) => r.envelope_id === envId);
      expect(queued).toHaveLength(1);
      expect(queued[0]!.signer_id).toBe(signerId);
      expect(queued[0]!.to_email).toBe('bea@example.com');
      expect(queued[0]!.payload).toMatchObject({
        sender_email: 'guest@example.com',
        sender_name: 'Guest User',
      });
    });

    it('POST /:id/send with no body returns 400 sender_email_missing', async () => {
      const { envId } = await buildAnonDraft();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(anonToken));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'sender_email_missing' });
    });

    it('POST /:id/send with malformed sender_email rejected by DTO with 400', async () => {
      const { envId } = await buildAnonDraft();
      const res = await request(app.getHttpServer())
        .post(`/envelopes/${envId}/send`)
        .set(auth(anonToken))
        .send({ sender_email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });
});
