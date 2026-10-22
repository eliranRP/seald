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
import { SealSweepRepository } from '../src/sealing/seal-sweep.service';
import { SealingService } from '../src/sealing/sealing.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemorySealSweepRepository } from './in-memory-seal-sweep-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';
import { dispatchSignToken } from './dispatched-sign-links';

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

describe('Seal sweep (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let sweepRepo: InMemorySealSweepRepository;
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
    sweepRepo = new InMemorySealSweepRepository(envelopesRepo);
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
      .overrideProvider(SealSweepRepository)
      .useValue(sweepRepo)
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
    sweepRepo.runningSince.clear();
    contactsRepo.reset();
    storage.reset();
    outbound.reset();
  });

  afterAll(async () => {
    await app.close();
  });

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
    const token = await dispatchSignToken(app, invite.to_email);
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

  /** Move the `all_signed` event (and so the envelope's signing time) into the past. */
  function backdateAllSigned(envId: string, ageMs: number): void {
    const at = new Date(Date.now() - ageMs).toISOString();
    for (const e of envelopesRepo.events) {
      if (e.envelope_id === envId && e.event_type === 'all_signed') {
        (e as { created_at: string }).created_at = at;
      }
    }
  }

  function sweep(secret: string | null = CRON_SECRET): request.Test {
    const req = request(app.getHttpServer()).post('/internal/cron/seal-sweep');
    return secret === null ? req : req.set('x-cron-secret', secret);
  }

  /** What the in-process worker does for one job. */
  async function workOnce(): Promise<void> {
    const job = await envelopesRepo.claimNextJob();
    if (!job) throw new Error('no claimable job');
    await sealing.processSealJob(job.envelope_id);
    await envelopesRepo.finishJob(job.id);
  }

  it('rejects a missing or wrong cron secret', async () => {
    await sweep(null).expect(401);
    await sweep('w'.repeat(40)).expect(401);
  });

  it('completes the seal after a job dies mid-run (reclaim)', async () => {
    const { envId } = await buildSignedEnvelope();
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('sealing');

    // The worker claims the job and the process is killed before finishing.
    const claimed = await envelopesRepo.claimNextJob();
    expect(claimed?.envelope_id).toBe(envId);
    expect(await envelopesRepo.claimNextJob()).toBeNull();
    backdateAllSigned(envId, 30 * 60_000);
    sweepRepo.runningSince.set(claimed!.id, new Date(Date.now() - 20 * 60_000));

    const res = await sweep().expect(200);
    expect(res.body).toMatchObject({ requeued: 1, requeued_envelope_ids: [envId], poison: 0 });

    await workOnce();
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('completed');
    expect(storage.allPaths()).toEqual(expect.arrayContaining([`${envId}/sealed.pdf`]));

    // Idempotent: nothing left to do on the next pass.
    const again = await sweep().expect(200);
    expect(again.body).toMatchObject({ requeued: 0, poison: 0 });
  });

  it('creates the missing job when the enqueue was lost', async () => {
    const { envId } = await buildSignedEnvelope();
    envelopesRepo.jobs.length = 0;
    backdateAllSigned(envId, 20 * 60_000);

    const res = await sweep().expect(200);
    expect(res.body).toMatchObject({ requeued: 1, requeued_envelope_ids: [envId] });
    expect(envelopesRepo.jobs).toHaveLength(1);

    await workOnce();
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('completed');
  });

  it('does not touch an envelope signed under 15 minutes ago', async () => {
    const { envId } = await buildSignedEnvelope();
    envelopesRepo.jobs.length = 0;
    backdateAllSigned(envId, 5 * 60_000);
    const res = await sweep().expect(200);
    expect(res.body).toMatchObject({ requeued: 0 });
    expect(envelopesRepo.jobs).toHaveLength(0);
  });

  it('logs poison envelopes older than 6 hours and leaves them alone', async () => {
    const { envId } = await buildSignedEnvelope();
    envelopesRepo.jobs.length = 0;
    backdateAllSigned(envId, 7 * 60 * 60_000);

    const res = await sweep().expect(200);
    expect(res.body).toMatchObject({ requeued: 0, poison: 1 });
    expect(envelopesRepo.jobs).toHaveLength(0);
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('sealing');
  });
});
