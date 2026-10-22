import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { buildTestJwks } from './test-jwks';
import { setFlag } from './pades-e2e-harness';
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
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

/**
 * WP-38 locale columns over HTTP (in-memory repos):
 *
 *   - flag off: `locale` is rejected like an unknown property on create,
 *     patch and add-signer, and no response carries `locale`;
 *   - flag on: `en` is accepted and returned on the envelope and signer,
 *     anything else is a 400.
 */
describe('Envelope locale (e2e, WP-38)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
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
        .useValue(new InMemoryContactsRepository())
        .overrideProvider(StorageService)
        .useValue(new InMemoryStorageService())
        .overrideProvider(OutboundEmailsRepository)
        .useValue(new InMemoryOutboundEmailsRepository()),
    ).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender-a@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
  });

  beforeEach(() => envelopesRepo.reset());
  afterEach(() => setFlag('i18n', undefined));
  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${tokenA}` });
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  it('flag off: locale is rejected everywhere and never returned', async () => {
    setFlag('i18n', false);
    const bad = await request(server())
      .post('/envelopes')
      .set(auth())
      .send({ title: 'T', locale: 'en' });
    expect(bad.status).toBe(400);

    const created = await request(server()).post('/envelopes').set(auth()).send({ title: 'T' });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('locale');
    const id = (created.body as { id: string }).id;

    const patch = await request(server())
      .patch(`/envelopes/${id}`)
      .set(auth())
      .send({ locale: 'en' });
    expect(patch.status).toBe(400);
    const signer = await request(server())
      .post(`/envelopes/${id}/signers`)
      .set(auth())
      .send({ email: 'a@example.com', name: 'A', locale: 'en' });
    expect(signer.status).toBe(400);

    const ok = await request(server())
      .post(`/envelopes/${id}/signers`)
      .set(auth())
      .send({ email: 'a@example.com', name: 'A' });
    expect(ok.status).toBe(201);
    expect(ok.body).not.toHaveProperty('locale');
  });

  it('flag on: en is stored and returned; other values are a 400', async () => {
    setFlag('i18n', true);
    const unsupported = await request(server())
      .post('/envelopes')
      .set(auth())
      .send({ title: 'T', locale: 'xx' });
    expect(unsupported.status).toBe(400);

    const created = await request(server())
      .post('/envelopes')
      .set(auth())
      .send({ title: 'T', locale: 'en' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ locale: 'en' });
    const id = (created.body as { id: string }).id;

    const patched = await request(server())
      .patch(`/envelopes/${id}`)
      .set(auth())
      .send({ locale: 'en' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ locale: 'en' });

    const signer = await request(server())
      .post(`/envelopes/${id}/signers`)
      .set(auth())
      .send({ email: 'a@example.com', name: 'A', locale: 'en' });
    expect(signer.status).toBe(201);
    expect(signer.body).toMatchObject({ locale: 'en' });
  });
});
