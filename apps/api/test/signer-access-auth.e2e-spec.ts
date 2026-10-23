import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  AccessAuthSettingsSchema,
  AccessCodeSendResponseSchema,
  SignStartAccessCodeRequiredSchema,
} from 'shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../src/email/email-sender';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { StepSweepRepository } from '../src/signing/step-sweep.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStepSweepRepository } from './in-memory-step-sweep-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { setFlag } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * WP-10 signer access code, end to end through AppModule with in-memory
 * repos:
 *
 *   - flag off: the new routes 404, `/sign/start` and `/sign/submit`
 *     behave as before, and `access_code` on submit is an unknown property.
 *   - gated start → send → verify → sign; the code exists only in the
 *     sent message; every step lands in the hash chain.
 *   - lockout after 5 wrong codes, cooldown with Retry-After, new code.
 *   - re-verify before submit (`action_auth`), covering the whole submit.
 *   - with sequential signing order (WP-05) and multi-document envelopes
 *     (WP-03).
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
  SIGNER_OTP_KEY: 'o'.repeat(48),
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
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;
const SIGN_LINK = /\/sign\/([0-9a-f-]{36})\?t=([A-Za-z0-9_-]{43})/;
const CODE_LINE = /^ {2}([0-9]{6})$/m;

interface Draft {
  readonly envId: string;
  readonly signerIds: Record<string, string>;
}

/** `name=value` of one Set-Cookie entry, or undefined. */
function cookieFrom(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  return hit?.split(';')[0];
}

describe('Signer access code (WP-10, e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let storage: InMemoryStorageService;
  let accessRepo: InMemoryAccessAuthRepository;
  let auth: { Authorization: string };
  let tinyPdf: Buffer;
  let png: Buffer;

  beforeAll(async () => {
    const tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    storage = new InMemoryStorageService();
    accessRepo = new InMemoryAccessAuthRepository(envelopesRepo);

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
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .overrideProvider(StepSweepRepository)
      .useValue(new InMemoryStepSweepRepository(envelopesRepo, outbound))
      .overrideProvider(AccessAuthRepository)
      .useValue(accessRepo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const token = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    auth = { Authorization: `Bearer ${token}` };

    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    tinyPdf = Buffer.from(await doc.save());
    png = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    envelopesRepo.reset();
    outbound.reset();
    storage.reset();
    accessRepo.challenges.length = 0;
    accessRepo.envelopeAuth.clear();
    accessRepo.signerAuth.clear();
    accessRepo.verificationChecks.clear();
  });

  afterEach(() => {
    setFlag('signerAccessAuth', undefined);
    setFlag('signingOrder', undefined);
    setFlag('multiDocumentEnvelopes', undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Drain the outbox like the worker; return every message sent. */
  async function drain(): Promise<EmailMessage[]> {
    const sender = app.get(EmailSender);
    const sent: EmailMessage[] = [];
    const spy = jest.spyOn(sender, 'send').mockImplementation(async (msg: EmailMessage) => {
      sent.push(msg);
      return { providerId: `test-${msg.idempotencyKey}` };
    });
    try {
      await app.get(EmailDispatcherService).flushOnce(500);
    } finally {
      spy.mockRestore();
    }
    return sent;
  }

  async function linkFor(email: string): Promise<string> {
    const sent = await drain();
    const msg = sent.filter((m) => m.to.email === email && SIGN_LINK.test(m.text)).pop();
    if (!msg) throw new Error(`no link for ${email}`);
    return SIGN_LINK.exec(msg.text)![2]!;
  }

  async function codeFor(email: string): Promise<{ code: string; message: EmailMessage }> {
    const sent = await drain();
    const message = sent.filter((m) => m.to.email === email && CODE_LINE.test(m.text)).pop();
    if (!message) throw new Error(`no code for ${email}`);
    return { code: CODE_LINE.exec(message.text)![1]!, message };
  }

  async function buildDraft(names: readonly string[]): Promise<Draft> {
    const env = await http().post('/envelopes').set(auth).send({ title: 'Lease' }).expect(201);
    const envId = env.body.id as string;
    await http()
      .post(`/envelopes/${envId}/upload`)
      .set(auth)
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' })
      .expect(201);
    const signerIds: Record<string, string> = {};
    for (const name of names) {
      const res = await http()
        .post(`/envelopes/${envId}/signers`)
        .set(auth)
        .send({ email: `${name}@example.com`, name })
        .expect(201);
      signerIds[name] = res.body.id as string;
    }
    await http()
      .put(`/envelopes/${envId}/fields`)
      .set(auth)
      .send({
        fields: names.map((name, i) => ({
          signer_id: signerIds[name],
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.1 + i * 0.2,
          required: true,
        })),
      })
      .expect(200);
    return { envId, signerIds };
  }

  function start(envId: string, token: string): request.Test {
    return http().post('/sign/start').send({ envelope_id: envId, token });
  }

  /** accept terms + signature; returns nothing, the caller submits. */
  async function prepare(cookie: string): Promise<void> {
    await http().post('/sign/accept-terms').set('Cookie', cookie).expect(204);
    await http()
      .post('/sign/signature')
      .set('Cookie', cookie)
      .field('format', 'drawn')
      .attach('image', png, { filename: 's.png', contentType: 'image/png' })
      .expect(200);
  }

  /** Gated start → send → verify. Returns the `seald_sign` cookie. */
  async function passAccessCode(envId: string, email: string, token: string): Promise<string> {
    const started = await start(envId, token).expect(200);
    expect(started.body.status).toBe('access_code_required');
    const pending = cookieFrom(started, 'seald_sign_access')!;
    await http().post('/sign/access-code/send').set('Cookie', pending).send({}).expect(200);
    const { code } = await codeFor(email);
    const verified = await http()
      .post('/sign/access-code/verify')
      .set('Cookie', pending)
      .send({ code })
      .expect(200);
    return cookieFrom(verified, 'seald_sign')!;
  }

  function eventsOf(envId: string, type: string) {
    return envelopesRepo.events.filter((e) => e.envelope_id === envId && e.event_type === type);
  }

  describe('flag off', () => {
    beforeEach(() => setFlag('signerAccessAuth', false));

    it('hides every new route and keeps start/submit unchanged', async () => {
      const { envId, signerIds } = await buildDraft(['ada']);
      await http().get(`/envelopes/${envId}/access-auth`).set(auth).expect(404);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'email_otp' })
        .expect(404);
      // Even a stored setting is ignored while the flag is off.
      accessRepo.signerAuth.set(signerIds['ada']!, { access: 'email_otp', action: 'email_otp' });
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const token = await linkFor('ada@example.com');
      const started = await start(envId, token).expect(200);
      expect(Object.keys(started.body).sort()).toEqual([
        'envelope_id',
        'requires_tc_accept',
        'signer_id',
      ]);
      const cookie = cookieFrom(started, 'seald_sign')!;
      await http().post('/sign/access-code/send').set('Cookie', cookie).send({}).expect(404);
      await http()
        .post('/sign/access-code/verify')
        .set('Cookie', cookie)
        .send({ code: '123456' })
        .expect(404);
      await prepare(cookie);
      const bad = await http()
        .post('/sign/submit')
        .set('Cookie', cookie)
        .send({ access_code: '123456' });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toContain('property access_code should not exist');
      const ok = await http().post('/sign/submit').set('Cookie', cookie).expect(200);
      expect(ok.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });
      expect(eventsOf(envId, 'access_code_sent')).toHaveLength(0);
    });
  });

  describe('flag on', () => {
    beforeEach(() => setFlag('signerAccessAuth', true));

    it('settings: GET and PATCH on a draft, 409 after send', async () => {
      const { envId, signerIds } = await buildDraft(['ada', 'bea']);
      const initial = await http().get(`/envelopes/${envId}/access-auth`).set(auth).expect(200);
      expect(AccessAuthSettingsSchema.parse(initial.body)).toMatchObject({
        access_auth: 'none',
        action_auth: 'none',
      });
      const patched = await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({
          access_auth: 'email_otp',
          signers: [{ signer_id: signerIds['bea'], access_auth: 'none', action_auth: 'email_otp' }],
        })
        .expect(200);
      const bySigner = Object.fromEntries(
        AccessAuthSettingsSchema.parse(patched.body).signers.map((s) => [s.signer_id, s]),
      );
      expect(bySigner[signerIds['ada']!]).toMatchObject({
        effective_access_auth: 'email_otp',
        effective_action_auth: 'none',
      });
      expect(bySigner[signerIds['bea']!]).toMatchObject({
        effective_access_auth: 'none',
        effective_action_auth: 'email_otp',
      });
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'sms' })
        .expect(400);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const late = await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'none' });
      expect(late.status).toBe(409);
      expect(late.body).toEqual({ error: 'envelope_not_draft' });
    });

    it('gated start → send → verify → sign, recorded in the chain', async () => {
      const { envId } = await buildDraft(['ada']);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'email_otp' })
        .expect(200);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const token = await linkFor('ada@example.com');

      const started = await start(envId, token).expect(200);
      expect(SignStartAccessCodeRequiredSchema.parse(started.body)).toMatchObject({
        status: 'access_code_required',
        email_masked: 'a***@example.com',
      });
      // No signer session: seald_sign is cleared, only the pending cookie is set.
      expect(cookieFrom(started, 'seald_sign')).toBe('seald_sign=');
      const pending = cookieFrom(started, 'seald_sign_access')!;
      expect(pending).toMatch(/^seald_sign_access=.+/);
      // The pending cookie is not a signer session.
      const pendingAsSession = pending.replace('seald_sign_access=', 'seald_sign=');
      await http().get('/sign/me').set('Cookie', pendingAsSession).expect(401);
      await http().get('/sign/me').set('Cookie', pending).expect(401);

      // Verify before any code was sent.
      const early = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code: '123456' });
      expect(early.status).toBe(409);
      expect(early.body).toEqual({ error: 'access_code_not_requested' });

      const sent = await http()
        .post('/sign/access-code/send')
        .set('Cookie', pending)
        .send({})
        .expect(200);
      expect(AccessCodeSendResponseSchema.parse(sent.body)).toEqual({
        status: 'sent',
        purpose: 'access',
        email_masked: 'a***@example.com',
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      });
      const again = await http().post('/sign/access-code/send').set('Cookie', pending).send({});
      expect(again.status).toBe(429);
      expect(again.body).toEqual({ error: 'access_code_cooldown' });
      expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);

      // The code lives only in the sent message: not in the outbox payload,
      // and the message carries no signing link.
      const { code, message } = await codeFor('ada@example.com');
      const row = outbound.rows.find((r) => r.kind === 'access_code')!;
      expect(JSON.stringify(row.payload)).not.toContain(code);
      expect(message.text).not.toMatch(SIGN_LINK);
      expect(message.html).not.toContain(token);
      expect(message.text).not.toContain(token);
      expect(message.subject).toContain(code);

      const wrong = code === '000000' ? '000001' : '000000';
      const miss = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code: wrong });
      expect(miss.status).toBe(422);
      expect(miss.body).toEqual({ error: 'access_code_invalid' });
      await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code: 'abc' })
        .expect(400);

      const verified = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code })
        .expect(200);
      expect(verified.body).toMatchObject({ requires_tc_accept: true });
      expect(cookieFrom(verified, 'seald_sign_access')).toBe('seald_sign_access=');
      const cookie = cookieFrom(verified, 'seald_sign')!;
      await http().get('/sign/me').set('Cookie', cookie).expect(200);
      // Replay of the used code.
      const replay = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code });
      expect(replay.status).toBe(409);

      await prepare(cookie);
      const done = await http().post('/sign/submit').set('Cookie', cookie).expect(200);
      expect(done.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });

      const types = envelopesRepo.events
        .filter((e) => e.envelope_id === envId)
        .map((e) => e.event_type);
      expect(types).toEqual(
        expect.arrayContaining(['access_code_sent', 'access_code_failed', 'access_code_verified']),
      );
      expect(types.indexOf('access_code_verified')).toBeLessThan(types.indexOf('signed'));
      expect(eventsOf(envId, 'access_code_verified')[0]!.metadata).toEqual({
        method: 'email_otp',
        purpose: 'access',
        to_masked: 'a***@example.com',
      });
      expect(await envelopesRepo.verifyEventChain(envId)).toEqual({ chain_intact: true });
      expect([...accessRepo.verificationChecks.values()]).toEqual([['email_otp']]);
    });

    it('locks after 5 wrong codes; a new code is required and works', async () => {
      const { envId, signerIds } = await buildDraft(['ada']);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'email_otp' })
        .expect(200);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const token = await linkFor('ada@example.com');
      const started = await start(envId, token).expect(200);
      const pending = cookieFrom(started, 'seald_sign_access')!;
      await http().post('/sign/access-code/send').set('Cookie', pending).send({}).expect(200);
      const { code } = await codeFor('ada@example.com');
      const wrong = code === '000000' ? '000001' : '000000';
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await http()
          .post('/sign/access-code/verify')
          .set('Cookie', pending)
          .send({ code: wrong });
        statuses.push(r.status);
      }
      expect(statuses).toEqual([422, 422, 422, 422, 423]);
      const locked = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code });
      expect(locked.status).toBe(423);
      expect(locked.body).toEqual({ error: 'access_code_locked' });
      expect(eventsOf(envId, 'access_code_failed')).toHaveLength(5);

      accessRepo.age(signerIds['ada']!, 61_000);
      await http().post('/sign/access-code/send').set('Cookie', pending).send({}).expect(200);
      const fresh = await codeFor('ada@example.com');
      const ok = await http()
        .post('/sign/access-code/verify')
        .set('Cookie', pending)
        .send({ code: fresh.code })
        .expect(200);
      expect(cookieFrom(ok, 'seald_sign')).toMatch(/^seald_sign=.+/);
    });

    it('re-verify before submit: the whole submit needs a fresh action code', async () => {
      const { envId, signerIds } = await buildDraft(['ada']);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ signers: [{ signer_id: signerIds['ada'], action_auth: 'email_otp' }] })
        .expect(200);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const token = await linkFor('ada@example.com');
      // No access code: a normal session.
      const started = await start(envId, token).expect(200);
      const cookie = cookieFrom(started, 'seald_sign')!;
      expect(started.body.status).toBeUndefined();
      await prepare(cookie);

      const noCode = await http().post('/sign/submit').set('Cookie', cookie);
      expect(noCode.status).toBe(428);
      expect(noCode.body).toEqual({ error: 'access_code_required' });

      // purpose=action needs the full session, not a pending cookie.
      await http().post('/sign/access-code/send').send({ purpose: 'action' }).expect(401);
      // An access code is not offered to a signer that does not need one.
      const notNeeded = await http()
        .post('/sign/access-code/send')
        .set('Cookie', cookie)
        .send({ purpose: 'access' });
      expect(notNeeded.status).toBe(401);

      await http()
        .post('/sign/access-code/send')
        .set('Cookie', cookie)
        .send({ purpose: 'action' })
        .expect(200);
      const { code, message } = await codeFor('ada@example.com');
      expect(message.text).toContain('finish signing');
      const wrong = code === '000000' ? '000001' : '000000';
      const miss = await http()
        .post('/sign/submit')
        .set('Cookie', cookie)
        .send({ access_code: wrong });
      expect(miss.status).toBe(422);
      expect(eventsOf(envId, 'signed')).toHaveLength(0);

      const ok = await http()
        .post('/sign/submit')
        .set('Cookie', cookie)
        .send({ access_code: code })
        .expect(200);
      expect(ok.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });
      const verified = eventsOf(envId, 'access_code_verified');
      expect(verified.map((e) => e.metadata['purpose'])).toEqual(['action']);
      const types = envelopesRepo.events
        .filter((e) => e.envelope_id === envId)
        .map((e) => e.event_type);
      expect(types.indexOf('access_code_verified')).toBeLessThan(types.indexOf('signed'));
    });

    it('works with sequential signing order: the later step is gated on its turn', async () => {
      setFlag('signingOrder', true);
      const { envId, signerIds } = await buildDraft(['ada', 'cy']);
      await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({
          delivery_mode: 'sequential',
          signers: [
            { signer_id: signerIds['ada'], signing_order: 1 },
            { signer_id: signerIds['cy'], signing_order: 2 },
          ],
        })
        .expect(200);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ signers: [{ signer_id: signerIds['cy'], access_auth: 'email_otp' }] })
        .expect(200);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);

      // Step 1 (Ada) needs no code.
      const adaToken = await linkFor('ada@example.com');
      const adaStart = await start(envId, adaToken).expect(200);
      const adaCookie = cookieFrom(adaStart, 'seald_sign')!;
      await prepare(adaCookie);
      await http().post('/sign/submit').set('Cookie', adaCookie).expect(200);

      // Step 2 (Cy) now has a link and must pass the code first.
      const cyToken = await linkFor('cy@example.com');
      const cyCookie = await passAccessCode(envId, 'cy@example.com', cyToken);
      await prepare(cyCookie);
      const done = await http().post('/sign/submit').set('Cookie', cyCookie).expect(200);
      expect(done.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });
      expect(eventsOf(envId, 'access_code_verified').map((e) => e.signer_id)).toEqual([
        signerIds['cy'],
      ]);
    });

    it('works with a multi-document envelope', async () => {
      setFlag('multiDocumentEnvelopes', true);
      const env = await http().post('/envelopes').set(auth).send({ title: 'Pack' }).expect(201);
      const envId = env.body.id as string;
      const docA = await http()
        .post(`/envelopes/${envId}/documents`)
        .set(auth)
        .attach('file', tinyPdf, { filename: 'A.pdf', contentType: 'application/pdf' })
        .expect(201);
      const docB = await http()
        .post(`/envelopes/${envId}/documents`)
        .set(auth)
        .attach('file', tinyPdf, { filename: 'B.pdf', contentType: 'application/pdf' })
        .expect(201);
      const signer = await http()
        .post(`/envelopes/${envId}/signers`)
        .set(auth)
        .send({ email: 'ada@example.com', name: 'ada' })
        .expect(201);
      await http()
        .put(`/envelopes/${envId}/fields`)
        .set(auth)
        .send({
          fields: [docA.body.id, docB.body.id].map((document_id: string, i) => ({
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1 + i * 0.2,
            required: true,
            document_id,
          })),
        })
        .expect(200);
      await http()
        .patch(`/envelopes/${envId}/access-auth`)
        .set(auth)
        .send({ access_auth: 'email_otp' })
        .expect(200);
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const token = await linkFor('ada@example.com');
      const cookie = await passAccessCode(envId, 'ada@example.com', token);
      const me = await http().get('/sign/me').set('Cookie', cookie).expect(200);
      expect(me.body.documents).toHaveLength(2);
      await prepare(cookie);
      const done = await http().post('/sign/submit').set('Cookie', cookie).expect(200);
      expect(done.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });
    });
  });
});
