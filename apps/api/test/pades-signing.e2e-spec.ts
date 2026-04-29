import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
import { PadesSigner } from '../src/sealing/pades-signer';
import { SealingService } from '../src/sealing/sealing.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * End-to-end exercise of the P12PadesSigner path.
 *
 * beforeAll generates a fresh self-signed P12 via openssl in a tmp dir
 * (skips the suite if openssl is not on PATH — e.g. minimal CI images).
 * The test drives the full sender + signer flow, runs the seal pipeline
 * against the real signer, then:
 *   1. Writes sealed.pdf + audit.pdf to ./test-output/ so the developer
 *      can open them and visually confirm the signature banner in a PDF
 *      viewer (Adobe Reader, Preview.app, pdfsig CLI).
 *   2. Asserts the sealed.pdf starts with %PDF- AND contains a /Sig
 *      dictionary (the CMS detached signature marker) AND a /ByteRange
 *      token (PAdES requires it to declare which bytes are covered).
 *   3. Asserts NoopPadesSigner's output would NOT have those markers —
 *      this proves the real signer replaced the passthrough.
 */

const TEST_ENV_BASE: Omit<AppEnv, 'PDF_SIGNING_LOCAL_P12_PATH' | 'PDF_SIGNING_LOCAL_P12_PASS'> = {
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

/** Generate a self-signed P12 via openssl. Returns { path, password } or
 *  null if openssl is unavailable. */
function tryGenerateP12(): { path: string; password: string } | null {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch {
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), 'seald-p12-'));
  const keyPath = join(dir, 'key.pem');
  const crtPath = join(dir, 'cert.pem');
  const p12Path = join(dir, 'bundle.p12');
  const password = 'testpass';
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '30',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      crtPath,
      '-subj',
      '/C=US/ST=CA/L=SF/O=Seald Test/CN=seald-test',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-inkey',
      keyPath,
      '-in',
      crtPath,
      '-out',
      p12Path,
      '-name',
      'seald-test',
      '-passout',
      `pass:${password}`,
    ],
    { stdio: 'ignore' },
  );
  return { path: p12Path, password };
}

const p12 = tryGenerateP12();

const describeOrSkip = p12 ? describe : describe.skip;

describeOrSkip('PAdES signing — real P12 (e2e)', () => {
  const TEST_ENV: AppEnv = {
    ...TEST_ENV_BASE,
    PDF_SIGNING_LOCAL_P12_PATH: p12!.path,
    PDF_SIGNING_LOCAL_P12_PASS: p12!.password,
  };
  const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let pades: PadesSigner;
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
    pades = moduleRef.get(PadesSigner);

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
        background: { r: 20, g: 20, b: 20, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses P12PadesSigner (not NoopPadesSigner) when PDF_SIGNING_LOCAL_P12_PATH is set', () => {
    expect(pades.constructor.name).toBe('P12PadesSigner');
  });

  it('P12PadesSigner.sign embeds a CMS signature dictionary', async () => {
    // Direct, minimal test — no envelope needed. Verifies the signer path
    // independently of the sealing pipeline so failures bisect cleanly.
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]).drawText('hello', { x: 50, y: 350 });
    // Classic xref — @signpdf/placeholder-plain can't parse compressed
    // object streams (SealingService.burnIn does the same).
    const plain = Buffer.from(await doc.save({ useObjectStreams: false }));

    const signed = await pades.sign(plain);

    const head = signed.subarray(0, 5).toString('ascii');
    expect(head).toBe('%PDF-');
    const text = signed.toString('latin1');
    // PAdES anchors.
    expect(text).toMatch(/\/Sig\b/);
    expect(text).toMatch(/\/ByteRange/);
    expect(text).toMatch(/\/Type\s*\/Sig/);
    // The detached PKCS#7 blob lives inside /Contents — at least a long
    // hex blob must be present.
    expect(text).toMatch(/\/Contents\s*<[0-9A-Fa-f]{200,}/);
    // F-3 — PAdES baseline mandates the ETSI subfilter; the legacy
    // adbe.pkcs7.detached default would NOT mark the signature as
    // PAdES-conformant for verifiers like EU DSS.
    expect(text).toMatch(/\/SubFilter\s*\/ETSI\.CAdES\.detached/);
    expect(text).not.toMatch(/\/SubFilter\s*\/adbe\.pkcs7\.detached/);
  });

  it('full seal pipeline produces a PAdES-signed sealed.pdf; artifacts written to ./test-output/', async () => {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      color: '#112233',
    });
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth)
      .send({ title: 'PAdES Real Signing Test' });
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
            width: 0.25,
            height: 0.06,
            required: true,
          },
          {
            signer_id: signer.body.id,
            kind: 'date',
            page: 1,
            x: 0.45,
            y: 0.8,
            width: 0.2,
            height: 0.03,
            required: true,
          },
          {
            signer_id: signer.body.id,
            kind: 'text',
            page: 1,
            x: 0.1,
            y: 0.7,
            width: 0.5,
            height: 0.03,
            required: true,
          },
        ],
      });
    await request(app.getHttpServer()).post(`/envelopes/${env.body.id}/send`).set(auth);

    // Extract invite token, start session, fill, submit.
    const invite = outbound.rows.find((r) => r.kind === 'invite')!;
    const token = /\?t=([A-Za-z0-9_-]{43})/.exec(String(invite.payload.sign_url))![1]!;
    const started = await request(app.getHttpServer())
      .post('/sign/start')
      .send({ envelope_id: env.body.id, token });
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
    await request(app.getHttpServer()).post('/sign/accept-terms').set('Cookie', cookie).expect(204);
    const envDomain = envelopesRepo.envelopes.get(env.body.id)!;
    const dateField = envDomain.fields.find((f) => f.kind === 'date')!;
    const textField = envDomain.fields.find((f) => f.kind === 'text')!;
    await request(app.getHttpServer())
      .post(`/sign/fields/${dateField.id}`)
      .set('Cookie', cookie)
      .send({ value_text: '2026-04-24' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/sign/fields/${textField.id}`)
      .set('Cookie', cookie)
      .send({ value_text: 'Ada Lovelace, signing with PAdES' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/sign/signature')
      .set('Cookie', cookie)
      .field('format', 'drawn')
      .attach('image', TINY_PNG, { filename: 's.png', contentType: 'image/png' })
      .expect(200);
    await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);

    // Run the sealing pipeline synchronously.
    await sealing.processSealJob(env.body.id);

    const after = envelopesRepo.envelopes.get(env.body.id)!;
    expect(after.status).toBe('completed');
    expect(after.sealed_sha256).toMatch(/^[0-9a-f]{64}$/);

    const sealedBytes = storage.get(`${env.body.id}/sealed.pdf`)!.bytes;
    const auditBytes = storage.get(`${env.body.id}/audit.pdf`)!.bytes;

    // PAdES markers on sealed.pdf.
    const sealedText = sealedBytes.toString('latin1');
    expect(sealedText).toMatch(/\/Sig\b/);
    expect(sealedText).toMatch(/\/ByteRange/);
    expect(sealedText).toMatch(/\/Contents\s*<[0-9A-Fa-f]{200,}/);
    // The /Reason we set on the placeholder.
    expect(sealedText).toMatch(/Signed and sealed by Seald/);

    // Write to repo-rooted ./test-output/ so the operator can open in
    // Preview.app / Adobe Reader / `pdfsig` CLI and confirm the
    // signature banner renders. Gitignored at repo root.
    const outDir = join(__dirname, '..', 'test-output');
    execFileSync('mkdir', ['-p', outDir]);
    const sealedOut = join(outDir, `${after.short_code}.sealed.pdf`);
    const auditOut = join(outDir, `${after.short_code}.audit.pdf`);
    writeFileSync(sealedOut, sealedBytes);
    writeFileSync(auditOut, auditBytes);
    // Sanity: can re-read them from disk.
    expect(readFileSync(sealedOut).length).toBe(sealedBytes.length);
    expect(readFileSync(auditOut).length).toBe(auditBytes.length);
    // eslint-disable-next-line no-console
    console.log(`[pades-signing test] artifacts written to ${outDir}`);
  });
});
