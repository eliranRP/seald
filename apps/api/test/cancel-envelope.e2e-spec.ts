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
  SIGNER_SESSION_SECRET: 'x'.repeat(64),
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

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

/**
 * Sender-initiated cancel ("withdraw") of a sent envelope.
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
describe('Envelopes — sender cancel (e2e)', () => {
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
    const match = /\?t=([A-Za-z0-9_-]{43})/.exec(String(invite.payload.sign_url));
    if (!match) throw new Error('could not parse plaintext token from sign_url');
    return { envId: env.body.id, signerId: signer.body.id, plaintextToken: match[1]! };
  }

  it('POST /envelopes/:id/cancel flips status, revokes pending tokens, fans out withdrawn_to_signer email, records canceled event', async () => {
    const { envId, signerId, plaintextToken } = await buildSentEnvelope();

    const cancel = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/cancel`)
      .set(auth(tokenA));
    expect(cancel.status).toBe(201);
    expect(cancel.body).toEqual({ status: 'canceled', envelope_status: 'canceled' });

    // Status is observably canceled on the next read.
    const fresh = await request(app.getHttpServer()).get(`/envelopes/${envId}`).set(auth(tokenA));
    expect(fresh.status).toBe(200);
    expect(fresh.body.status).toBe('canceled');

    // The signer's plaintext token is dead — /sign/start should 401, not
    // surface the (now-invalid) session.
    const start = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: envId, token: plaintextToken });
    expect(start.status).toBe(401);
    expect(start.body).toEqual({ error: 'invalid_token' });

    // Audit timeline carries the `canceled` + `session_invalidated_by_cancel` events.
    const events = await request(app.getHttpServer())
      .get(`/envelopes/${envId}/events`)
      .set(auth(tokenA));
    expect(events.status).toBe(200);
    const types = events.body.events.map((e: { event_type: string }) => e.event_type);
    expect(types).toContain('canceled');
    expect(types).toContain('session_invalidated_by_cancel');

    // The pending signer received a `withdrawn_to_signer` email.
    const withdrawn = outbound.rows.filter(
      (r) => r.envelope_id === envId && r.kind === 'withdrawn_to_signer',
    );
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]!.signer_id).toBe(signerId);
    expect(withdrawn[0]!.to_email).toBe('ada@example.com');
  });

  it('returns 409 envelope_terminal on a second cancel', async () => {
    const { envId } = await buildSentEnvelope();
    await request(app.getHttpServer()).post(`/envelopes/${envId}/cancel`).set(auth(tokenA));

    const second = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/cancel`)
      .set(auth(tokenA));
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'envelope_terminal' });
  });

  it('returns 404 envelope_not_found when caller is not the owner', async () => {
    const { envId } = await buildSentEnvelope();
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${envId}/cancel`)
      .set(auth(tokenB));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'envelope_not_found' });
  });

  it('returns 409 envelope_terminal when called on a draft envelope', async () => {
    // A draft envelope hasn't been sent — the proper way to remove it is
    // DELETE /envelopes/:id. /cancel is reserved for sent envelopes.
    const draft = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth(tokenA))
      .send({ title: 'Still a draft' });
    const res = await request(app.getHttpServer())
      .post(`/envelopes/${draft.body.id}/cancel`)
      .set(auth(tokenA));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'envelope_terminal' });
  });
});
