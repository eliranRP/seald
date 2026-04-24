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
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
};

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

describe('Signing — /sign/start (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
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

    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );

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

  async function buildSentEnvelope(): Promise<{
    envId: string;
    signerId: string;
    plaintextToken: string;
  }> {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth)
      .send({ title: 'Sign me' });
    await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/upload`)
      .set(auth)
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
    const signer = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth)
      .send({ contact_id: contact.id });
    await request(app.getHttpServer())
      .put(`/envelopes/${env.body.id}/fields`)
      .set(auth)
      .send({
        fields: [
          { signer_id: signer.body.id, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);

    // Extract the plaintext token from the queued invite email's sign_url.
    const invite = outbound.rows.find((r) => r.kind === 'invite');
    if (!invite) throw new Error('expected an invite to be enqueued');
    const match = /\?t=([A-Za-z0-9_-]{43})/.exec(String(invite.payload.sign_url));
    if (!match) throw new Error('could not parse token from sign_url');
    return { envId: env.body.id, signerId: signer.body.id, plaintextToken: match[1]! };
  }

  describe('POST /sign/start', () => {
    it('exchanges a valid token for a session cookie', async () => {
      const { envId, signerId, plaintextToken } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: plaintextToken });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        envelope_id: envId,
        signer_id: signerId,
        requires_tc_accept: true,
      });
      const setCookie = res.headers['set-cookie'] as unknown as string[] | string | undefined;
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
      expect(cookieStr).toMatch(/^seald_sign=/);
      expect(cookieStr).toMatch(/HttpOnly/i);
      expect(cookieStr).toMatch(/SameSite=Lax/i);
      expect(cookieStr).toMatch(/Path=\/sign/);
      // Secure flag is omitted in test (NODE_ENV=test)
      expect(cookieStr).not.toMatch(/Secure/i);
    });

    it('rejects an unknown token with 401 invalid_token', async () => {
      const { envId } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({
          envelope_id: envId,
          token: 'A'.repeat(43),
        });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_token' });
    });

    it('rejects when envelope_id in body does not match the token owner', async () => {
      const { plaintextToken } = await buildSentEnvelope();
      const res = await request(app.getHttpServer()).post('/sign/start').send({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        token: plaintextToken,
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_token' });
    });

    it('rejects malformed body with 400 (DTO validation)', async () => {
      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: 'not-a-uuid', token: 'short' });
      expect(res.status).toBe(400);
    });

    it('rejects unknown fields with 400 (whitelist pipe)', async () => {
      const { envId, plaintextToken } = await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: plaintextToken, extra: 'nope' });
      expect(res.status).toBe(400);
    });

    it('replay after sign success: once signer is marked signed_at, token exchange fails', async () => {
      const { envId, signerId, plaintextToken } = await buildSentEnvelope();
      // Simulate the signer having already signed — stamp signed_at on the row.
      const e = envelopesRepo.envelopes.get(envId)!;
      const next = {
        ...e,
        signers: e.signers.map((s) =>
          s.id === signerId ? { ...s, signed_at: new Date().toISOString() } : s,
        ),
      };
      envelopesRepo.envelopes.set(envId, next);

      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: plaintextToken });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'already_signed' });
    });

    it('replay after decline: terminal envelope short-circuits to 410', async () => {
      const { envId, plaintextToken } = await buildSentEnvelope();
      const e = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, { ...e, status: 'declined' });

      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: plaintextToken });
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ error: 'envelope_terminal' });
    });
  });
});
