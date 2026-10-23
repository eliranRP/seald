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
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { dispatchSignToken } from './dispatched-sign-links';
import { buildTestJwks } from './test-jwks';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';

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
};

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

/**
 * Undo after Send (POST /envelopes/:id/unsend).
 *
 * Verifies the full pipeline end-to-end:
 *   1. POST /envelopes/:id/cancel flips an awaiting_others envelope to
 *      `canceled` and emits a `canceled` event in the audit timeline.
 *   2. The pending signer's previously-issued plaintext token can no
 *      longer exchange via /sign/start (401 invalid_token) — i.e. the
 *      access_token_hash was actually revoked.
 *   3. Re-issuing /cancel on the same envelope returns 409 (idempotency
 *      guard via envelope_terminal).
 *   4. Cross-owner cancel returns 404.
 */
describe('Envelopes — unsend (e2e)', () => {
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

    const moduleRef = await stubGdriveForEnvelopeDetail(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_ENV)
        .useValue(TEST_ENV)
        .overrideProvider(JWKS_RESOLVER)
        .useValue(tk.resolver)
        .overrideProvider(EnvelopesRepository)
        .useValue(envelopesRepo)
        .overrideProvider(EnvelopeDocumentsRepository)
        .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
        .overrideProvider(ContactsRepository)
        .useValue(contactsRepo)
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(OutboundEmailsRepository)
        .useValue(outbound),
    ).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const signOpts = { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE };
    tokenA = await tk.sign({ sub: USER_A, email: 'sender-a@example.com' }, signOpts);
    tokenB = await tk.sign({ sub: USER_B, email: 'sender-b@example.com' }, signOpts);

    const doc = await PDFDocument.create();
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

  /** Drive a full draft → upload → addSigner → fields → send pipeline so
   *  the cancel test starts from a real `awaiting_others` envelope with a
   *  hashed access token. Returns the plaintext token threaded into the
   *  invite email so we can later assert that `/sign/start` 401s after
   *  cancel revokes the hash. */
  async function buildSentEnvelope(): Promise<{
    envId: string;
    signerId: string;
    plaintextToken: string;
  }> {
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Cancel me' });
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
          { signer_id: signer.body.id, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth(tokenA));

    const invite = outbound.rows.find((r) => r.kind === 'invite');
    if (!invite) throw new Error('expected invite to be enqueued');
    // Insert A: the token exists only in the dispatched message.
    const plaintextToken = await dispatchSignToken(app, invite.to_email);
    return { envId: env.body.id, signerId: signer.body.id, plaintextToken };
  }

  it('returns a just-sent envelope to draft, cancels the pending invite, kills the token, appends an unsent event', async () => {
    const { envId, plaintextToken } = await buildSentEnvelope();
    const before = outbound.rows.filter((r) => r.envelope_id === envId && r.kind === 'invite');
    expect(before).toHaveLength(1);

    const res = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/unsend`)
      .set(auth(tokenA));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.sent_at).toBeNull();

    const fresh = await request(app.getHttpServer()).get(`/envelopes/${envId}`).set(auth(tokenA));
    expect(fresh.body.status).toBe('draft');

    const invites = outbound.rows.filter((r) => r.envelope_id === envId && r.kind === 'invite');
    expect(invites.every((r) => r.status === 'canceled' || r.status === 'sent')).toBe(true);

    const start = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: envId, token: plaintextToken });
    expect(start.status).toBe(401);

    const events = await request(app.getHttpServer())
      .get(`/envelopes/${envId}/events`)
      .set(auth(tokenA));
    const types = events.body.events.map((e: { event_type: string }) => e.event_type);
    expect(types[types.length - 1]).toBe('unsent');
    expect(types).toContain('sent');

    const chain = await request(app.getHttpServer()).get(`/verify/${fresh.body.id}`);
    if (chain.status === 200) expect(chain.body.chain_intact).toBe(true);
  });

  it('can be sent again after an unsend', async () => {
    const { envId } = await buildSentEnvelope();
    await request(app.getHttpServer()).post(`/envelopes/${envId}/unsend`).set(auth(tokenA));
    const again = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/send`)
      .set(auth(tokenA));
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('awaiting_others');
  });

  it('409 unsend_signer_engaged once a signer opened the document', async () => {
    const { envId, signerId } = await buildSentEnvelope();
    await envelopesRepo.recordSignerViewed(signerId, null, null);
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/unsend`)
      .set(auth(tokenA));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'unsend_signer_engaged' });
  });

  it('409 unsend_window_expired after the grace window', async () => {
    const { envId } = await buildSentEnvelope();
    const env = await envelopesRepo.findByIdWithAll(envId);
    const old = new Date(Date.now() - 60_000).toISOString();
    envelopesRepo.envelopes.set(envId, { ...env!, sent_at: old });
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/unsend`)
      .set(auth(tokenA));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'unsend_window_expired' });
  });

  it('409 envelope_not_sent on a draft', async () => {
    const draft = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Still a draft' });
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${draft.body.id}/unsend`)
      .set(auth(tokenA));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'envelope_not_sent' });
  });

  it('404 envelope_not_found for a non-owner', async () => {
    const { envId } = await buildSentEnvelope();
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/unsend`)
      .set(auth(tokenB));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'envelope_not_found' });
  });
});
