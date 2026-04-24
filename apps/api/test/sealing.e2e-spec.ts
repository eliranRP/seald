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
import { SealingService } from '../src/sealing/sealing.service';
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
  WORKER_ENABLED: false,
};

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

describe('Sealing pipeline (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tinyPdf: Buffer;
  let TINY_PNG: Buffer;

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

    sealing = moduleRef.get(SealingService);

    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );

    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    tinyPdf = Buffer.from(await doc.save());

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

  beforeEach(() => {
    envelopesRepo.reset();
    contactsRepo.reset();
    storage.reset();
    outbound.reset();
  });
  afterAll(async () => {
    await app.close();
  });

  /** Drive the full sender+signer flow for a single-signer envelope up to
   *  the point where the envelope has transitioned to `sealing`. */
  async function buildSignedEnvelope(): Promise<{
    envId: string;
    signerId: string;
    shortCode: string;
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
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.8,
            width: 0.2,
            height: 0.05,
            required: true,
          },
          {
            signer_id: signer.body.id,
            kind: 'date',
            page: 1,
            x: 0.4,
            y: 0.8,
            width: 0.2,
            height: 0.03,
            required: true,
          },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);

    const invite = outbound.rows.find((r) => r.kind === 'invite')!;
    const token = /\?t=([A-Za-z0-9_-]{43})/.exec(String(invite.payload.sign_url))![1]!;
    const started = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: env.body.id, token });
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;

    await request(app.getHttpServer()).post('/sign/accept-terms').set('Cookie', cookie).expect(204);
    const dateField = envelopesRepo.envelopes
      .get(env.body.id)!
      .fields.find((f) => f.kind === 'date')!;
    await request(app.getHttpServer())
      .post(`/sign/fields/${dateField.id}`)
      .set('Cookie', cookie)
      .send({ value_text: '2026-04-24' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/sign/signature')
      .set('Cookie', cookie)
      .field('format', 'drawn')
      .attach('image', TINY_PNG, { filename: 's.png', contentType: 'image/png' })
      .expect(200);
    await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);

    return {
      envId: env.body.id,
      signerId: signer.body.id,
      shortCode: envelopesRepo.envelopes.get(env.body.id)!.short_code,
    };
  }

  it('seal job: produces sealed.pdf + audit.pdf, transitions to completed, queues completed email', async () => {
    const { envId, signerId } = await buildSignedEnvelope();

    // Precondition: envelope is in 'sealing' after last submit.
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('sealing');

    await sealing.processSealJob(envId);

    const after = envelopesRepo.envelopes.get(envId)!;
    expect(after.status).toBe('completed');
    expect(after.sealed_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(after.completed_at).not.toBeNull();

    // sealed.pdf + audit.pdf uploaded.
    const sealedPath = `${envId}/sealed.pdf`;
    const auditPath = `${envId}/audit.pdf`;
    expect(storage.allPaths()).toEqual(expect.arrayContaining([sealedPath, auditPath]));
    expect(envelopesRepo.sealedPaths.get(envId)).toBe(sealedPath);
    expect(envelopesRepo.auditPaths.get(envId)).toBe(auditPath);

    // Both artifacts are valid PDFs (start with %PDF-).
    expect(storage.get(sealedPath)!.bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(storage.get(auditPath)!.bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // `sealed` system event appended.
    const sealedEvents = envelopesRepo.events.filter(
      (e) => e.envelope_id === envId && e.event_type === 'sealed',
    );
    expect(sealedEvents).toHaveLength(1);
    expect(sealedEvents[0]!.actor_kind).toBe('system');
    expect(sealedEvents[0]!.metadata).toMatchObject({ sealed_sha256: after.sealed_sha256 });

    // `completed` email queued for the signer.
    const completedEmails = outbound.rows.filter(
      (r) => r.envelope_id === envId && r.kind === 'completed',
    );
    expect(completedEmails).toHaveLength(1);
    expect(completedEmails[0]!.signer_id).toBe(signerId);
    expect(completedEmails[0]!.payload).toMatchObject({
      short_code: after.short_code,
      verify_url: expect.stringContaining('/verify/'),
    });
  });

  it('seal job is a no-op if envelope raced out of sealing', async () => {
    const { envId } = await buildSignedEnvelope();
    // Simulate a race: someone expired the envelope before the worker ran.
    const env = envelopesRepo.envelopes.get(envId)!;
    envelopesRepo.envelopes.set(envId, { ...env, status: 'expired' });

    await expect(sealing.processSealJob(envId)).resolves.toBeUndefined();

    // Nothing uploaded, no state change.
    expect(envelopesRepo.sealedPaths.has(envId)).toBe(false);
    expect(envelopesRepo.auditPaths.has(envId)).toBe(false);
  });

  it('audit_only job: produces audit.pdf + setAuditFile, no sealed.pdf', async () => {
    // Build a 1-signer sent envelope, decline to flip to 'declined' + enqueue audit_only.
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
          { signer_id: signer.body.id, kind: 'signature', page: 1, x: 0.1, y: 0.8, required: true },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);
    const invite = outbound.rows.find((r) => r.kind === 'invite')!;
    const token = /\?t=([A-Za-z0-9_-]{43})/.exec(String(invite.payload.sign_url))![1]!;
    const started = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: env.body.id, token });
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
    await request(app.getHttpServer())
      .post('/sign/decline')
      .set('Cookie', cookie)
      .send({ reason: 'no' })
      .expect(200);

    expect(envelopesRepo.envelopes.get(env.body.id)!.status).toBe('declined');

    await sealing.processAuditOnlyJob(env.body.id);

    const auditPath = `${env.body.id}/audit.pdf`;
    expect(storage.allPaths()).toContain(auditPath);
    expect(storage.allPaths()).not.toContain(`${env.body.id}/sealed.pdf`);
    expect(envelopesRepo.auditPaths.get(env.body.id)).toBe(auditPath);

    // Envelope stays in 'declined'.
    expect(envelopesRepo.envelopes.get(env.body.id)!.status).toBe('declined');

    // No completed emails generated (decline path).
    expect(outbound.rows.filter((r) => r.kind === 'completed')).toHaveLength(0);
  });
});
