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

  describe('POST /sign/submit', () => {
    let TINY_PNG: Buffer;
    beforeAll(async () => {
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

    /** Complete the whole signer flow: accept terms, upload signature, then
     *  the test verifies /sign/submit behavior. */
    async function prepareReadyForSubmit(): Promise<{
      envId: string;
      signerId: string;
      cookie: string;
    }> {
      const ctx = await startSessionAndGetCookie();
      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', ctx.cookie)
        .expect(204);
      await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', ctx.cookie)
        .field('format', 'drawn')
        .attach('image', TINY_PNG, { filename: 's.png', contentType: 'image/png' })
        .expect(200);
      return ctx;
    }

    it('412 tc_required when TC not accepted', async () => {
      const { cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie);
      expect(res.status).toBe(412);
      expect(res.body).toEqual({ error: 'tc_required' });
    });

    it('412 signature_required when no signature uploaded', async () => {
      const { cookie } = await startSessionAndGetCookie();
      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', cookie)
        .expect(204);
      const res = await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie);
      expect(res.status).toBe(412);
      expect(res.body).toEqual({ error: 'signature_required' });
    });

    it('happy path — transitions to sealing, enqueues seal job, clears cookie', async () => {
      const { envId, signerId, cookie } = await prepareReadyForSubmit();

      const res = await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'submitted',
        envelope_status: 'sealing',
      });

      // Session cookie cleared (Max-Age=0).
      const setCookie = res.headers['set-cookie'] as unknown as string[] | string;
      const cookieStr = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
      expect(cookieStr).toMatch(/Max-Age=0/i);

      // Envelope status flipped.
      const env = envelopesRepo.envelopes.get(envId)!;
      expect(env.status).toBe('sealing');

      // Events: signed + all_signed
      const signerEvents = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.signer_id === signerId,
      );
      expect(signerEvents.some((e) => e.event_type === 'signed')).toBe(true);

      const allSigned = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'all_signed',
      );
      expect(allSigned).toHaveLength(1);

      // Seal job queued.
      const jobs = envelopesRepo.jobs.filter((j) => j.envelope_id === envId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.kind).toBe('seal');
    });

    it('rejects re-submit after cookie cleared → 401', async () => {
      const { cookie } = await prepareReadyForSubmit();
      await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);
      // Session cookie cleared server-side, but the cookie header in our client
      // is unchanged. The guard finds the envelope now in 'sealing' state and
      // rejects with 410.
      const second = await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie);
      expect(second.status).toBe(410);
      expect(second.body).toEqual({ error: 'envelope_terminal' });
    });
  });

  describe('POST /sign/decline', () => {
    let TINY_PNG: Buffer;
    beforeAll(async () => {
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

    /** Build a 2-signer sent envelope and return cookies for both. Used for
     *  the cascade-email test below. */
    async function buildTwoSignerSent(): Promise<{
      envId: string;
      signerA: { id: string; cookie: string; email: string };
      signerB: { id: string; email: string; plaintextToken: string };
    }> {
      const auth = { Authorization: `Bearer ${tokenA}` };
      const contactA = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const contactB = await contactsRepo.create({
        owner_id: USER_A,
        name: 'Bob',
        email: 'bob@example.com',
        color: '#445566',
      });
      const env = await request(app.getHttpServer())
        .post('/envelopes')
        .set(auth)
        .send({ title: 'Two-signer' });
      await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/upload`)
        .set(auth)
        .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
      const sA = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth)
        .send({ contact_id: contactA.id });
      const sB = await request(app.getHttpServer())
        .post(`/envelopes/${env.body.id}/signers`)
        .set(auth)
        .send({ contact_id: contactB.id });
      await request(app.getHttpServer())
        .put(`/envelopes/${env.body.id}/fields`)
        .set(auth)
        .send({
          fields: [
            { signer_id: sA.body.id, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
            { signer_id: sB.body.id, kind: 'signature', page: 1, x: 0.3, y: 0.1, required: true },
          ],
        });
      await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);

      const invites = outbound.rows.filter((r) => r.kind === 'invite');
      const inviteA = invites.find((r) => r.signer_id === sA.body.id)!;
      const inviteB = invites.find((r) => r.signer_id === sB.body.id)!;
      const tokA = /\?t=([A-Za-z0-9_-]{43})/.exec(String(inviteA.payload.sign_url))![1]!;
      const tokB = /\?t=([A-Za-z0-9_-]{43})/.exec(String(inviteB.payload.sign_url))![1]!;

      const startedA = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: env.body.id, token: tokA })
        .expect(200);
      const setCookie = startedA.headers['set-cookie'] as unknown as string[] | string;
      const cookieStr = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
      const cookieA = cookieStr.split(';')[0]!;

      return {
        envId: env.body.id,
        signerA: { id: sA.body.id, cookie: cookieA, email: 'ada@example.com' },
        signerB: { id: sB.body.id, email: 'bob@example.com', plaintextToken: tokB },
      };
    }

    it('happy path — single signer declines, envelope goes to declined, cookie cleared, audit_only enqueued', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();

      const res = await request(app.getHttpServer())
        .post('/sign/decline')
        .set('Cookie', cookie)
        .send({ reason: 'Not comfortable with terms' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'declined', envelope_status: 'declined' });

      // Cookie cleared.
      const setCookie = res.headers['set-cookie'] as unknown as string[] | string;
      const cookieStr = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
      expect(cookieStr).toMatch(/Max-Age=0/i);

      // Envelope terminal.
      const env = envelopesRepo.envelopes.get(envId)!;
      expect(env.status).toBe('declined');

      // `declined` event with metadata about reason presence/length (not content).
      const declined = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'declined',
      );
      expect(declined).toHaveLength(1);
      expect(declined[0]!.signer_id).toBe(signerId);
      expect(declined[0]!.metadata).toMatchObject({
        reason_provided: true,
        reason_length: 'Not comfortable with terms'.length,
      });

      // Reason stashed in the fixture's side-map (decline_reason column in PG).
      expect(envelopesRepo.getDeclineReason(signerId)).toBe('Not comfortable with terms');

      // audit_only job queued (no seal).
      const jobs = envelopesRepo.jobs.filter((j) => j.envelope_id === envId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.kind).toBe('audit_only');
    });

    it('decline without reason still succeeds; reason_provided=false in event metadata', async () => {
      const { envId, signerId, cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .post('/sign/decline')
        .set('Cookie', cookie)
        .send({});
      expect(res.status).toBe(200);
      const declined = envelopesRepo.events.find(
        (e) => e.envelope_id === envId && e.event_type === 'declined' && e.signer_id === signerId,
      )!;
      expect(declined.metadata).toMatchObject({ reason_provided: false, reason_length: 0 });
    });

    it('rejects reason longer than 500 chars (DTO MaxLength)', async () => {
      const { cookie } = await startSessionAndGetCookie();
      const res = await request(app.getHttpServer())
        .post('/sign/decline')
        .set('Cookie', cookie)
        .send({ reason: 'x'.repeat(501) });
      expect(res.status).toBe(400);
    });

    it('multi-signer: other signer gets withdrawn_to_signer email + session_invalidated_by_decline event', async () => {
      const { envId, signerA, signerB } = await buildTwoSignerSent();

      await request(app.getHttpServer())
        .post('/sign/decline')
        .set('Cookie', signerA.cookie)
        .send({ reason: 'changed my mind' })
        .expect(200);

      // session_invalidated_by_decline event for signer B.
      const invalidated = envelopesRepo.events.filter(
        (e) =>
          e.envelope_id === envId &&
          e.event_type === 'session_invalidated_by_decline' &&
          e.signer_id === signerB.id,
      );
      expect(invalidated).toHaveLength(1);
      expect(invalidated[0]!.metadata).toMatchObject({ cause_signer_id: signerA.id });

      // Withdrawn email queued to the non-signed co-signer.
      const withdraw = outbound.rows.filter(
        (r) =>
          r.envelope_id === envId && r.signer_id === signerB.id && r.kind === 'withdrawn_to_signer',
      );
      expect(withdraw).toHaveLength(1);
      expect(withdraw[0]!.to_email).toBe(signerB.email);

      // Signer B's token exchange now 410s (envelope terminal).
      const res = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: signerB.plaintextToken });
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ error: 'envelope_terminal' });
    });

    it('multi-signer: happy path — both sign, envelope seals only after the last', async () => {
      const { envId, signerA, signerB } = await buildTwoSignerSent();

      // Signer A: accept terms, set signature, submit.
      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', signerA.cookie)
        .expect(204);
      await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', signerA.cookie)
        .field('format', 'drawn')
        .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(200);
      const submitA = await request(app.getHttpServer())
        .post('/sign/submit')
        .set('Cookie', signerA.cookie);
      expect(submitA.status).toBe(200);
      // After the first signer, envelope still awaiting_others.
      expect(submitA.body.envelope_status).toBe('awaiting_others');
      expect(envelopesRepo.envelopes.get(envId)!.status).toBe('awaiting_others');
      // No seal job yet.
      expect(envelopesRepo.jobs.filter((j) => j.envelope_id === envId)).toHaveLength(0);

      // Signer B: exchange their token for a fresh cookie, then complete.
      const startedB = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token: signerB.plaintextToken })
        .expect(200);
      const setCookieB = startedB.headers['set-cookie'] as unknown as string[] | string;
      const cookieB = (Array.isArray(setCookieB) ? setCookieB[0]! : setCookieB).split(';')[0]!;
      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', cookieB)
        .expect(204);
      await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookieB)
        .field('format', 'drawn')
        .attach('image', TINY_PNG, { filename: 'b.png', contentType: 'image/png' })
        .expect(200);
      const submitB = await request(app.getHttpServer())
        .post('/sign/submit')
        .set('Cookie', cookieB);
      expect(submitB.status).toBe(200);
      expect(submitB.body.envelope_status).toBe('sealing');

      // all_signed fires exactly once at the transition.
      const allSigned = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'all_signed',
      );
      expect(allSigned).toHaveLength(1);

      // Both signers have a `signed` event.
      const signedEvents = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'signed',
      );
      expect(signedEvents).toHaveLength(2);
      expect(new Set(signedEvents.map((e) => e.signer_id))).toEqual(
        new Set([signerA.id, signerB.id]),
      );

      // Seal job enqueued exactly once.
      const jobs = envelopesRepo.jobs.filter((j) => j.envelope_id === envId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.kind).toBe('seal');
    });

    it('rejects decline after envelope already declined → 410', async () => {
      const { envId, cookie } = await startSessionAndGetCookie();
      const e = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, { ...e, status: 'declined' });
      const res = await request(app.getHttpServer())
        .post('/sign/decline')
        .set('Cookie', cookie)
        .send({});
      // Guard short-circuits before service; 410 envelope_terminal.
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ error: 'envelope_terminal' });
    });
  });
});
