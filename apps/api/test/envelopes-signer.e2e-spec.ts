import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
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

  /** Helper: run the full /sign/start flow and return the cookie header for
   *  use in downstream requests. */
  async function startSessionAndGetCookie(): Promise<{
    envId: string;
    signerId: string;
    cookie: string;
  }> {
    const { envId, signerId, plaintextToken } = await buildSentEnvelope();
    const started = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: envId, token: plaintextToken });
    expect(started.status).toBe(200);
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookieStr = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
    // `Set-Cookie: seald_sign=xxx; HttpOnly; ...` → strip attributes
    const cookie = cookieStr.split(';')[0]!;
    return { envId, signerId, cookie };
  }

  describe('session guard — missing / invalid session', () => {
    it('GET /sign/me without cookie → 401 missing_signer_session', async () => {
      const res = await request(app.getHttpServer()).get('/sign/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_signer_session' });
    });

    it('GET /sign/me with garbage cookie → 401 invalid_signer_session', async () => {
      const res = await request(app.getHttpServer())
        .get('/sign/me')
        .set('Cookie', 'seald_sign=not.a.jwt');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_signer_session' });
    });

    it('session-protected routes reject after envelope goes terminal', async () => {
      const { envId, cookie } = await startSessionAndGetCookie();
      const e = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, { ...e, status: 'declined' });
      const res = await request(app.getHttpServer()).get('/sign/me').set('Cookie', cookie);
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ error: 'envelope_terminal' });
    });
  });

  describe('GET /sign/me', () => {
    it('returns a redacted view of the envelope scoped to the signer', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer()).get('/sign/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.envelope).toMatchObject({
        id: envId,
        title: 'Sign me',
        status: 'awaiting_others',
      });
      expect(res.body.envelope.short_code).toHaveLength(13);
      expect(res.body.signer).toMatchObject({
        id: signerId,
        email: 'ada@example.com',
        name: 'Ada',
        status: 'awaiting',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      });
      // Only the signer's own fields are surfaced.
      expect(res.body.fields).toHaveLength(1);
      expect(res.body.fields[0].signer_id).toBe(signerId);
      // Single-signer envelope → no other signers.
      expect(res.body.other_signers).toEqual([]);
    });
  });

  describe('GET /sign/pdf', () => {
    it('redirects to a signed URL for the original.pdf', async () => {
      const { envId, cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .get('/sign/pdf')
        .set('Cookie', cookie)
        .redirects(0);
      expect(res.status).toBe(302);
      const location = res.headers['location'] as string;
      expect(location).toContain(`${envId}%2Foriginal.pdf`);
      expect(location).toContain('token=');
    });
  });

  describe('POST /sign/accept-terms', () => {
    it('stamps tc_accepted_at + viewed_at and writes both audit events', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();

      const accept = await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', cookie);
      expect(accept.status).toBe(204);

      // /sign/me now shows the timestamps populated.
      const me = await request(app.getHttpServer()).get('/sign/me').set('Cookie', cookie);
      expect(me.body.signer.tc_accepted_at).not.toBeNull();
      expect(me.body.signer.viewed_at).not.toBeNull();

      // Audit events written — both tc_accepted and viewed appear for this signer.
      const events = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.signer_id === signerId,
      );
      const types = events.map((e) => e.event_type).sort();
      expect(types).toEqual(expect.arrayContaining(['tc_accepted', 'viewed']));
    });

    it('second call is idempotent — no duplicate audit events', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();
      await request(app.getHttpServer()).post('/sign/accept-terms').set('Cookie', cookie);
      await request(app.getHttpServer()).post('/sign/accept-terms').set('Cookie', cookie);
      const tcCount = envelopesRepo.events.filter(
        (e) =>
          e.envelope_id === envId && e.signer_id === signerId && e.event_type === 'tc_accepted',
      ).length;
      expect(tcCount).toBe(1);
    });
  });

  describe('POST /sign/fields/:field_id', () => {
    async function placeDateField(envId: string, signerId: string): Promise<string> {
      const env = envelopesRepo.envelopes.get(envId)!;
      const dateField = {
        id: '55555555-5555-4555-8555-555555555555',
        signer_id: signerId,
        kind: 'date' as const,
        page: 1,
        x: 0.3,
        y: 0.3,
        width: null,
        height: null,
        required: true,
        link_id: null,
        value_text: null,
        value_boolean: null,
        filled_at: null,
      };
      envelopesRepo.envelopes.set(envId, {
        ...env,
        fields: [...env.fields, dateField],
      });
      return dateField.id;
    }

    it('fills a text field and records a field_filled event', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();
      const dateFieldId = await placeDateField(envId, signerId);

      const res = await request(app.getHttpServer())
        .post(`/sign/fields/${dateFieldId}`)
        .set('Cookie', cookie)
        .send({ value_text: '2026-04-24' });
      expect(res.status).toBe(200);
      expect(res.body.value_text).toBe('2026-04-24');
      expect(res.body.filled_at).not.toBeNull();

      const events = envelopesRepo.events.filter(
        (e) =>
          e.envelope_id === envId && e.signer_id === signerId && e.event_type === 'field_filled',
      );
      expect(events).toHaveLength(1);
    });

    it('rejects filling a signature field via this endpoint → 400 wrong_field_kind', async () => {
      const { envId, cookie } = await startSessionAndGetCookie();
      const env = envelopesRepo.envelopes.get(envId)!;
      const signatureField = env.fields[0]!;

      const res = await request(app.getHttpServer())
        .post(`/sign/fields/${signatureField.id}`)
        .set('Cookie', cookie)
        .send({ value_text: 'hi' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'wrong_field_kind' });
    });

    it('rejects filling a field owned by another signer → 404 field_not_found', async () => {
      const { envId, cookie } = await startSessionAndGetCookie();
      const env = envelopesRepo.envelopes.get(envId)!;
      const foreignField = {
        id: '66666666-6666-4666-8666-666666666666',
        signer_id: '77777777-7777-4777-8777-777777777777',
        kind: 'date' as const,
        page: 1,
        x: 0.5,
        y: 0.5,
        width: null,
        height: null,
        required: true,
        link_id: null,
        value_text: null,
        value_boolean: null,
        filled_at: null,
      };
      envelopesRepo.envelopes.set(envId, { ...env, fields: [...env.fields, foreignField] });

      const res = await request(app.getHttpServer())
        .post(`/sign/fields/${foreignField.id}`)
        .set('Cookie', cookie)
        .send({ value_text: 'hi' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'field_not_found' });
    });
  });

  describe('POST /sign/signature', () => {
    let TINY_PNG: Buffer;
    beforeAll(async () => {
      // Deterministic 50×50 white PNG — generated via sharp itself so it's
      // guaranteed to round-trip cleanly through the server's sharp call.
      TINY_PNG = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
    });

    it('accepts a valid PNG, normalizes via sharp, stamps signer metadata', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();

      const res = await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'drawn')
        .field('stroke_count', '42')
        .attach('image', TINY_PNG, { filename: 's.png', contentType: 'image/png' });
      expect(res.status).toBe(200);

      const storagePath = `${envId}/signatures/${signerId}.png`;
      expect(storage.allPaths()).toContain(storagePath);
      const stored = storage.get(storagePath)!;
      expect(stored.contentType).toBe('image/png');
      expect(stored.bytes.length).toBeGreaterThan(0);
      expect(stored.bytes.equals(TINY_PNG)).toBe(false); // sharp re-encoded it

      const meta = envelopesRepo.getSignerInternalMeta(signerId);
      expect(meta?.signature_format).toBe('drawn');
      expect(meta?.signature_image_path).toBe(storagePath);
      expect(meta?.signature_stroke_count).toBe(42);
    });

    it('rejects non-PNG/JPEG bytes with 415 image_not_png_or_jpeg', async () => {
      const { cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'drawn')
        .attach('image', Buffer.from('definitely not an image'), {
          filename: 'fake.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(415);
      expect(res.body).toEqual({ error: 'image_not_png_or_jpeg' });
    });

    it('rejects missing file with 400 image_unreadable', async () => {
      const { cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'drawn');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'image_unreadable' });
    });

    it('rejects invalid format enum with 400', async () => {
      const { cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'not-a-real-format')
        .attach('image', TINY_PNG, { filename: 's.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
    });
  });
});
