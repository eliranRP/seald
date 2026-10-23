import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { SCAN_MAX_PAGES } from 'shared';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { SCAN_MAX_OPEN_PER_OWNER } from '../src/scan-sessions/scan-sessions.service';
import { ScanSessionsRepository } from '../src/scan-sessions/scan-sessions.repository';
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { StepSweepRepository } from '../src/signing/step-sweep.service';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryScanSessionsRepository } from './in-memory-scan-sessions-repository';
import { InMemoryStepSweepRepository } from './in-memory-step-sweep-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * Scan with phone (redesign v2 WS-J), end to end through AppModule with
 * in-memory repos: the owner creates a session, the phone posts one PDF
 * with only the code, the owner takes it once.
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

const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

describe('Scan with phone (e2e)', () => {
  let app: INestApplication;
  let sessions: InMemoryScanSessionsRepository;
  let storage: InMemoryStorageService;
  let auth: { Authorization: string };
  let authOther: { Authorization: string };

  beforeAll(async () => {
    const tk = await buildTestJwks();
    const envelopesRepo = new InMemoryEnvelopesRepository();
    const outbound = new InMemoryOutboundEmailsRepository();
    sessions = new InMemoryScanSessionsRepository();
    storage = new InMemoryStorageService();

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
      .overrideProvider(TemplatesRepository)
      .useValue(new InMemoryTemplatesRepository())
      .overrideProvider(ScanSessionsRepository)
      .useValue(sessions)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .overrideProvider(StepSweepRepository)
      .useValue(new InMemoryStepSweepRepository(envelopesRepo, outbound))
      .overrideProvider(AccessAuthRepository)
      .useValue(new InMemoryAccessAuthRepository(envelopesRepo))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const sign = (sub: string, email: string) =>
      tk.sign({ sub, email }, { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE });
    auth = { Authorization: `Bearer ${await sign(OWNER, 'owner@example.com')}` };
    authOther = { Authorization: `Bearer ${await sign(OTHER, 'other@example.com')}` };
  });

  beforeEach(() => {
    sessions.reset();
    storage.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function createCode(as = auth): Promise<string> {
    const res = await http().post('/scan-sessions').set(as).expect(201);
    return res.body.code as string;
  }

  it('requires sign-in to create a session and to read its status', async () => {
    await http().post('/scan-sessions').expect(401);
    const code = await createCode();
    await http().get(`/scan-sessions/${code}`).expect(401);
    await http().get(`/scan-sessions/${code}/pdf`).expect(401);
  });

  it('creates a 10 minute session and stores only the hash of the code', async () => {
    const res = await http().post('/scan-sessions').set(auth).expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const ttl = new Date(res.body.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    const [row] = sessions.all();
    expect(row?.code_hash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(res.body.code);
  });

  it('runs the whole hand-off: phone posts once, owner takes once', async () => {
    const code = await createCode();

    const pending = await http().get(`/scan-sessions/${code}`).set(auth).expect(200);
    expect(pending.body).toMatchObject({ status: 'pending', page_count: null });
    const phoneView = await http().get(`/scan-sessions/${code}/phone`).expect(200);
    expect(phoneView.body.status).toBe('pending');
    expect(Object.keys(phoneView.body).sort()).toEqual(['expires_at', 'status']);

    const pdf = await makePdf(3);
    const posted = await http()
      .post(`/scan-sessions/${code}/pdf`)
      .attach('file', pdf, { filename: 'scan.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(posted.body).toEqual({ page_count: 3 });

    const received = await http().get(`/scan-sessions/${code}`).set(auth).expect(200);
    expect(received.body).toMatchObject({ status: 'received', page_count: 3 });

    const taken = await http()
      .get(`/scan-sessions/${code}/pdf`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(taken.headers['content-type']).toContain('application/pdf');
    expect((taken.body as Buffer).equals(pdf)).toBe(true);

    // Taken once: the object is gone and a second take is refused.
    await http().get(`/scan-sessions/${code}/pdf`).set(auth).expect(409);
    expect(await storage.exists(`scan-sessions/${OWNER}/${sessions.all()[0]?.id}.pdf`)).toBe(false);
  });

  it('accepts only one PDF per code', async () => {
    const code = await createCode();
    const pdf = await makePdf(1);
    await http().post(`/scan-sessions/${code}/pdf`).attach('file', pdf, 'a.pdf').expect(201);
    await http().post(`/scan-sessions/${code}/pdf`).attach('file', pdf, 'b.pdf').expect(409);
  });

  it('keeps the session open after a rejected PDF', async () => {
    const code = await createCode();
    await http()
      .post(`/scan-sessions/${code}/pdf`)
      .attach('file', Buffer.from('not a pdf at all'), 'x.pdf')
      .expect(415);
    await http().get(`/scan-sessions/${code}/phone`).expect(200);
    await http()
      .post(`/scan-sessions/${code}/pdf`)
      .attach('file', await makePdf(1), 'ok.pdf')
      .expect(201);
  });

  it(`rejects a scan of more than ${SCAN_MAX_PAGES} pages`, async () => {
    const code = await createCode();
    const res = await http()
      .post(`/scan-sessions/${code}/pdf`)
      .attach('file', await makePdf(SCAN_MAX_PAGES + 1), 'big.pdf')
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('too_many_pages');
  });

  it('requires a file', async () => {
    const code = await createCode();
    await http().post(`/scan-sessions/${code}/pdf`).expect(400);
  });

  it('answers an unknown or malformed code with 404, never a hint', async () => {
    await http().get('/scan-sessions/short/phone').expect(404);
    await http()
      .get(`/scan-sessions/${'A'.repeat(32)}/phone`)
      .expect(404);
    await http()
      .post(`/scan-sessions/${'A'.repeat(32)}/pdf`)
      .attach('file', await makePdf(1), 'a.pdf')
      .expect(404);
  });

  it("does not show one owner's session to another", async () => {
    const code = await createCode();
    await http().get(`/scan-sessions/${code}`).set(authOther).expect(404);
    await http().get(`/scan-sessions/${code}/pdf`).set(authOther).expect(404);
  });

  it('refuses a PDF after the code expired and reports it expired', async () => {
    const code = await createCode();
    const row = sessions.all()[0];
    sessions.setExpiry(row!.id, new Date(Date.now() - 1000).toISOString());
    const view = await http().get(`/scan-sessions/${code}`).set(auth).expect(200);
    expect(view.body.status).toBe('expired');
    await http()
      .post(`/scan-sessions/${code}/pdf`)
      .attach('file', await makePdf(1), 'a.pdf')
      .expect(410);
  });

  it('purges expired sessions and caps open ones per owner', async () => {
    const first = await createCode();
    sessions.setExpiry(sessions.all()[0]!.id, new Date(Date.now() - 1000).toISOString());
    await createCode();
    expect(sessions.all()).toHaveLength(1);
    await http().get(`/scan-sessions/${first}/phone`).expect(404);

    for (let i = 1; i < SCAN_MAX_OPEN_PER_OWNER; i++) await createCode();
    await http().post('/scan-sessions').set(auth).expect(429);
    // Another owner is not affected.
    await http().post('/scan-sessions').set(authOther).expect(201);
  });
});
