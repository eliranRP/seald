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

const CRON_SECRET = 's'.repeat(48);

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
  CRON_SECRET,
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
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

describe('Verify + cron (e2e)', () => {
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

  async function buildSentEnvelope(): Promise<{ envId: string; shortCode: string }> {
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
      .send({ title: 'Contract' });
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
    return {
      envId: env.body.id,
      shortCode: envelopesRepo.envelopes.get(env.body.id)!.short_code,
    };
  }

  describe('GET /verify/:short_code', () => {
    it('returns 404 for unknown short_code', async () => {
      const res = await request(app.getHttpServer()).get('/verify/NOPE-NOPE-NOPE');
      expect(res.status).toBe(404);
    });

    it('returns envelope metadata + signers + redacted events; no sealed_url when awaiting', async () => {
      const { envId, shortCode } = await buildSentEnvelope();
      const res = await request(app.getHttpServer()).get(`/verify/${shortCode}`);
      expect(res.status).toBe(200);
      expect(res.body.envelope).toMatchObject({
        id: envId,
        title: 'Contract',
        short_code: shortCode,
        status: 'awaiting_others',
      });
      expect(res.body.signers).toHaveLength(1);
      expect(res.body.signers[0]).toMatchObject({
        name: 'Ada',
        email: 'ada@example.com',
        status: 'awaiting',
      });
      expect(res.body.events.length).toBeGreaterThan(0);
      // Events are redacted — ip/user_agent must NOT leak.
      for (const ev of res.body.events) {
        expect(ev.ip).toBeUndefined();
        expect(ev.user_agent).toBeUndefined();
        expect(ev.metadata).toBeUndefined();
      }
      // Not sealed yet.
      expect(res.body.sealed_url).toBeNull();
      expect(res.body.audit_url).toBeNull();
    });

    it('returns signed sealed_url + audit_url once envelope is completed', async () => {
      const { envId, shortCode } = await buildSentEnvelope();
      // Simulate a completed envelope with artifacts on disk.
      const env = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, {
        ...env,
        status: 'completed',
        sealed_sha256: 'a'.repeat(64),
        completed_at: new Date().toISOString(),
      });
      await storage.upload(`${envId}/sealed.pdf`, Buffer.from('%PDF-fake'), 'application/pdf');
      await storage.upload(`${envId}/audit.pdf`, Buffer.from('%PDF-fake'), 'application/pdf');

      const res = await request(app.getHttpServer()).get(`/verify/${shortCode}`);
      expect(res.status).toBe(200);
      expect(res.body.envelope.sealed_sha256).toBe('a'.repeat(64));
      expect(res.body.sealed_url).toMatch(/sealed\.pdf/);
      expect(res.body.audit_url).toMatch(/audit\.pdf/);
    });
  });

  describe('POST /internal/cron/expire', () => {
    it('rejects missing secret with 401', async () => {
      const res = await request(app.getHttpServer()).post('/internal/cron/expire');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_cron_secret' });
    });

    it('rejects wrong secret with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/internal/cron/expire')
        .set('X-Cron-Secret', 'nope');
      expect(res.status).toBe(401);
    });

    it('expires overdue envelopes + enqueues audit_only + appends expired event', async () => {
      const { envId } = await buildSentEnvelope();
      // Backdate expires_at on the envelope row.
      const env = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, {
        ...env,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/internal/cron/expire')
        .set('X-Cron-Secret', CRON_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.expired_count).toBe(1);
      expect(res.body.envelope_ids).toEqual([envId]);

      // Status flipped.
      expect(envelopesRepo.envelopes.get(envId)!.status).toBe('expired');
      // audit_only job enqueued.
      expect(envelopesRepo.jobs.find((j) => j.envelope_id === envId)?.kind).toBe('audit_only');
      // expired event appended.
      const expiredEvents = envelopesRepo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'expired',
      );
      expect(expiredEvents).toHaveLength(1);
    });

    it('no-op when nothing overdue', async () => {
      await buildSentEnvelope();
      const res = await request(app.getHttpServer())
        .post('/internal/cron/expire')
        .set('X-Cron-Secret', CRON_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.expired_count).toBe(0);
    });
  });
});
