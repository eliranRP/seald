import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { PadesSigner } from '../src/sealing/pades-signer';
import { SealingService } from '../src/sealing/sealing.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';
import { setFlag, startFakeTsa, tryGenerateP12, TS_NODE_BIN } from './pades-e2e-harness';
import { dispatchSignToken } from './dispatched-sign-links';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { detectPadesProfile } from '../src/sealing/pades-profile';

/**
 * WP-01 sealing hardening, end to end through AppModule with a real P12
 * signer and an in-process RFC 3161 TSA:
 *
 *   - a completed envelope seals to PAdES-B-LTA, and the CI gate (the
 *     pades-verify CLI) reports the /DocTimeStamp after the /DSS;
 *   - with `appendCertificate` on, the certificate pages sit inside the
 *     sealed file and it still verifies;
 *   - a declined envelope gets a stamped, sealed declined.pdf that
 *     verifies and is served by `download?kind=declined`.
 *
 * Artefacts land in ./test-output/ so the CI `pades-verify` job checks
 * them too. Skips if openssl is missing.
 */

const USER_A = '00000000-0000-0000-0000-00000000000a';

const p12 = tryGenerateP12();
const describeOrSkip = p12 ? describe : describe.skip;

describeOrSkip('Sealing hardening — B-LTA, appended certificate, declined.pdf (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let tsa: { url: string; server: Server; hits: number[] };
  let tokenA: string;
  let tinyPdf: Buffer;
  let tinyPng: Buffer;
  const outDir = join(__dirname, '..', 'test-output');

  beforeAll(async () => {
    tsa = await startFakeTsa();
    const tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    contactsRepo = new InMemoryContactsRepository();
    storage = new InMemoryStorageService();
    outbound = new InMemoryOutboundEmailsRepository();

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
      PDF_SIGNING_LOCAL_P12_PATH: p12!.path,
      PDF_SIGNING_LOCAL_P12_PASS: p12!.password,
      PDF_SIGNING_TSA_URL: tsa.url,
      WORKER_ENABLED: false,
      GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
      GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(EnvelopeDocumentsRepository)
      .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      // signerAccessAuth ships on: /sign/start reads access settings.
      .overrideProvider(AccessAuthRepository)
      .useValue(new InMemoryAccessAuthRepository(envelopesRepo))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    sealing = moduleRef.get(SealingService);
    expect(moduleRef.get(PadesSigner).constructor.name).toBe('P12PadesSigner');

    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawText('WP-01 sample', { x: 72, y: 700 });
    doc.addPage([612, 792]);
    tinyPdf = Buffer.from(await doc.save());
    tinyPng = await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    execFileSync('mkdir', ['-p', outDir]);
  });

  afterAll(async () => {
    setFlag('appendCertificate', undefined);
    await app.close();
    await new Promise<void>((r) => tsa.server.close(() => r()));
  });

  /** Sender creates + sends a one-signer envelope; returns the signer cookie. */
  async function sendEnvelope(title: string): Promise<{ envId: string; cookie: string }> {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada Lovelace',
      email: `ada+${randomBytes(3).toString('hex')}@example.com`,
      color: '#112233',
    });
    const env = await request(app.getHttpServer()).post('/envelopes').set(auth).send({ title });
    await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/upload`)
      .set(auth)
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' })
      .expect(201);
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
            width: 0.25,
            height: 0.06,
            required: true,
          },
        ],
      })
      .expect(200);
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);
    const invite = outbound.rows.filter((r) => r.kind === 'invite').pop()!;
    const token = await dispatchSignToken(app, invite.to_email);
    const started = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: env.body.id, token });
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
    await request(app.getHttpServer()).post('/sign/accept-terms').set('Cookie', cookie).expect(204);
    return { envId: env.body.id, cookie };
  }

  async function signAndSeal(title: string): Promise<{ envId: string; sealed: Buffer }> {
    const { envId, cookie } = await sendEnvelope(title);
    await request(app.getHttpServer())
      .post('/sign/signature')
      .set('Cookie', cookie)
      .field('format', 'drawn')
      .attach('image', tinyPng, { filename: 's.png', contentType: 'image/png' })
      .expect(200);
    await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);
    await sealing.processSealJob(envId);
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('completed');
    return { envId, sealed: storage.get(`${envId}/sealed.pdf`)!.bytes };
  }

  /**
   * Run the real pades-verify CLI (the CI gate, rule S.4) on just this
   * file and require PASS with B-T, B-LT and B-LTA reported.
   */
  function expectBLta(name: string, pdf: Buffer): void {
    writeFileSync(join(outDir, name), pdf);
    const dir = mkdtempSync(join(tmpdir(), 'seald-wp01-verify-'));
    writeFileSync(join(dir, name), pdf);
    const result = spawnSync(
      process.execPath,
      [TS_NODE_BIN, '--transpile-only', 'scripts/verify-pades.ts', dir],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );
    expect(result.stdout).toContain(`[PASS] ${name}`);
    expect(result.stdout).toContain('PAdES-B-T: id-aa-signatureTimeStampToken present');
    expect(result.stdout).toContain('PAdES-B-LT: /DSS dictionary present on catalog');
    expect(result.stdout).toContain(
      'PAdES-B-LTA: /DocTimeStamp after /DSS covers the file; messageImprint matches',
    );
    expect(result.status).toBe(0);
    // The verify page's PAdES and Timestamped claims come from this read.
    expect(detectPadesProfile(pdf)).toEqual({ level: 'B-LTA', timestamped: true });
  }

  it('seals a completed envelope to PAdES-B-LTA', async () => {
    setFlag('appendCertificate', false);
    const hitsBefore = tsa.hits.length;
    const { sealed } = await signAndSeal('WP-01 B-LTA');
    // One TSA call for the B-T signature timestamp, one for B-LTA.
    expect(tsa.hits.length - hitsBefore).toBe(2);
    expect(await PDFDocument.load(sealed).then((d) => d.getPageCount())).toBe(2);
    expectBLta('wp01-b-lta.sealed.pdf', sealed);
  });

  it('appendCertificate: certificate pages sit inside the sealed file, which still verifies', async () => {
    setFlag('appendCertificate', true);
    try {
      const { envId, sealed } = await signAndSeal('WP-01 appended certificate');
      const audit = storage.get(`${envId}/audit.pdf`)!.bytes;
      const auditPages = (await PDFDocument.load(audit)).getPageCount();
      const sealedPages = (await PDFDocument.load(sealed)).getPageCount();
      expect(sealedPages).toBe(2 + auditPages);
      expectBLta('wp01-appended-certificate.sealed.pdf', sealed);
      // audit.pdf stays the record of the sealed hash.
      expect(envelopesRepo.envelopes.get(envId)!.sealed_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      setFlag('appendCertificate', false);
    }
  });

  it('declined: audit_only writes a sealed declined.pdf served by kind=declined', async () => {
    const { envId, cookie } = await sendEnvelope('WP-01 declined');
    await request(app.getHttpServer())
      .post('/sign/decline')
      .set('Cookie', cookie)
      .send({ reason: 'no' })
      .expect(200);
    expect(envelopesRepo.envelopes.get(envId)!.status).toBe('declined');

    const auth = { Authorization: `Bearer ${tokenA}` };
    await request(app.getHttpServer())
      .get(`/envelopes/${envId}/download?kind=declined`)
      .set(auth)
      .expect(400);

    await sealing.processAuditOnlyJob(envId);

    const declined = storage.get(`${envId}/declined.pdf`)!.bytes;
    expect((await PDFDocument.load(declined)).getPageCount()).toBe(2);
    expectBLta('wp01-declined.pdf', declined);

    const res = await request(app.getHttpServer())
      .get(`/envelopes/${envId}/download?kind=declined`)
      .set(auth)
      .expect(200);
    expect(res.body.kind).toBe('declined');
    expect(res.body.url).toContain(encodeURIComponent(`${envId}/declined.pdf`));
    expect(storage.get(`${envId}/audit.pdf`)).toBeDefined();
  });
});
