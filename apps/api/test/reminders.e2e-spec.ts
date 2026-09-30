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

describe('Automated reminders (e2e)', () => {
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

  async function buildSentEnvelope(): Promise<{ envId: string; signerId: string }> {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const existing = (await contactsRepo.findAllByOwner(USER_A)).find(
      (row) => row.email === 'ada@example.com',
    );
    const contact =
      existing ??
      (await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      }));
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
            y: 0.1,
            required: true,
          },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);
    return { envId: env.body.id as string, signerId: signer.body.id as string };
  }

  function ageInvite(envId: string, signerId: string): void {
    const aged = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    envelopesRepo.backdateInvite(signerId, aged);
    for (let i = 0; i < outbound.rows.length; i += 1) {
      const row = outbound.rows[i]!;
      if (row.envelope_id === envId && (row.kind === 'invite' || row.kind === 'reminder')) {
        outbound.rows[i] = { ...row, created_at: aged };
      }
    }
  }

  function sweep() {
    return request(app.getHttpServer())
      .post('/internal/cron/reminders')
      .set('x-cron-secret', CRON_SECRET);
  }

  it('queues one token-free reminder per unsigned signer and does not repeat inside 24h', async () => {
    const { envId, signerId } = await buildSentEnvelope();
    ageInvite(envId, signerId);

    const first = await sweep();
    expect(first.status).toBe(200);
    expect(first.body.queued).toBe(1);

    const reminders = outbound.rows.filter((row) => row.kind === 'reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.payload).not.toHaveProperty('sign_url');
    expect(JSON.stringify(reminders[0]?.payload)).not.toMatch(/[?&]t=/);
    expect(reminders[0]?.to_email).toBe('ada@example.com');

    const second = await sweep();
    expect(second.status).toBe(200);
    expect(second.body.queued).toBe(0);
    expect(outbound.rows.filter((row) => row.kind === 'reminder')).toHaveLength(1);
  });

  it('skips a fresh invite, a disabled envelope, a signed signer, and a terminal envelope', async () => {
    await buildSentEnvelope();
    const tooSoon = await sweep();
    expect(tooSoon.body.queued).toBe(0);

    const disabled = await buildSentEnvelope();
    ageInvite(disabled.envId, disabled.signerId);
    const patched = await request(app.getHttpServer())
      .patch(`/envelopes/${disabled.envId}`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ reminders_enabled: false });
    expect(patched.status).toBe(200);
    expect(patched.body.reminders_enabled).toBe(false);
    const disabledSweep = await sweep();
    expect(disabledSweep.body.queued).toBe(0);

    const signed = await buildSentEnvelope();
    ageInvite(signed.envId, signed.signerId);
    const signedEnv = envelopesRepo.envelopes.get(signed.envId)!;
    envelopesRepo.envelopes.set(signed.envId, {
      ...signedEnv,
      signers: signedEnv.signers.map((signer) =>
        signer.id === signed.signerId
          ? { ...signer, signed_at: new Date().toISOString(), status: 'completed' as const }
          : signer,
      ),
    });
    expect((await sweep()).body.queued).toBe(0);

    const terminal = await buildSentEnvelope();
    ageInvite(terminal.envId, terminal.signerId);
    const terminalEnv = envelopesRepo.envelopes.get(terminal.envId)!;
    envelopesRepo.envelopes.set(terminal.envId, { ...terminalEnv, status: 'canceled' });
    expect((await sweep()).body.queued).toBe(0);
  });
});
