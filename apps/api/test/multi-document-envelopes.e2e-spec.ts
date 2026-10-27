import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { VerifyDocumentSchema, isFeatureEnabled } from 'shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { PadesSigner } from '../src/sealing/pades-signer';
import { SealingService } from '../src/sealing/sealing.service';
import { StorageService } from '../src/storage/storage.service';
import { dispatchSignToken } from './dispatched-sign-links';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { setFlag, startFakeTsa, tryGenerateP12, TS_NODE_BIN } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';
import { detectPadesProfile } from '../src/sealing/pades-profile';

/**
 * WP-03 multi-file envelopes, end to end through AppModule with a real
 * P12 signer and an in-process TSA:
 *
 *   - flag on: two documents are added to a draft, fields are placed on
 *     each, the envelope is signed and sealed; both sealed PDFs pass the
 *     pades-verify CLI (B-LTA), /verify reports per-document hashes,
 *     downloads take `document_id` and `kind=zip`;
 *   - drafts: reorder, remove, the last-document and cap guards;
 *   - flag off: the documents routes 404 and the legacy responses carry
 *     no `documents` / `document_id`.
 *
 * Sealed PDFs land in ./test-output/ for the CI `pades-verify` job.
 */
const USER_A = '00000000-0000-0000-0000-00000000000a';

const p12 = tryGenerateP12();
const describeOrSkip = p12 ? describe : describe.skip;

async function makePdf(pages: number, label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([612, 792]).drawText(`${label} p${i + 1}`, { x: 72, y: 700 });
  }
  return Buffer.from(await doc.save());
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describeOrSkip('Multi-file envelopes (e2e, WP-03)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let docsRepo: InMemoryEnvelopeDocumentsRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let tsa: { url: string; server: Server; hits: number[] };
  let tokenA: string;
  let pdfA: Buffer;
  let pdfB: Buffer;
  let png: Buffer;
  const outDir = join(__dirname, '..', 'test-output');
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${tokenA}` });

  beforeAll(async () => {
    tsa = await startFakeTsa();
    const tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    docsRepo = new InMemoryEnvelopeDocumentsRepository(envelopesRepo);
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
      .useValue(docsRepo)
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
    pdfA = await makePdf(2, 'Contract');
    pdfB = await makePdf(1, 'Annex');
    png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    execFileSync('mkdir', ['-p', outDir]);
  });

  afterAll(async () => {
    setFlag('multiDocumentEnvelopes', undefined);
    await app.close();
    await new Promise<void>((r) => tsa.server.close(() => r()));
  });

  function expectBLta(name: string, pdf: Buffer): void {
    writeFileSync(join(outDir, name), pdf);
    const dir = mkdtempSync(join(tmpdir(), 'seald-wp03-verify-'));
    writeFileSync(join(dir, name), pdf);
    const result = spawnSync(
      process.execPath,
      [TS_NODE_BIN, '--transpile-only', 'scripts/verify-pades.ts', dir],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );
    expect(result.stdout).toContain(`[PASS] ${name}`);
    expect(result.stdout).toContain(
      'PAdES-B-LTA: /DocTimeStamp after /DSS covers the file; messageImprint matches',
    );
    expect(result.status).toBe(0);
    // The verify page's PAdES and Timestamped claims come from this read.
    expect(detectPadesProfile(pdf)).toEqual({ level: 'B-LTA', timestamped: true });
  }

  async function draftWithSigner(title: string): Promise<{ envId: string; signerId: string }> {
    const contact = await contactsRepo.create({
      owner_id: USER_A,
      name: 'Ada Lovelace',
      email: `ada+${randomBytes(3).toString('hex')}@example.com`,
      color: '#112233',
    });
    const env = await request(app.getHttpServer())
      .post('/envelopes')
      .set(auth())
      .send({ title })
      .expect(201);
    const signer = await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/signers`)
      .set(auth())
      .send({ contact_id: contact.id })
      .expect(201);
    return { envId: env.body.id, signerId: signer.body.id };
  }

  function addDocument(envId: string, pdf: Buffer, filename: string): request.Test {
    return request(app.getHttpServer())
      .post(`/envelopes/${envId}/documents`)
      .set(auth())
      .attach('file', pdf, { filename, contentType: 'application/pdf' });
  }

  describe('flag on', () => {
    beforeAll(() => setFlag('multiDocumentEnvelopes', true));
    afterAll(() => setFlag('multiDocumentEnvelopes', undefined));

    it('seals a 2-document envelope: each document sealed separately, both verify, one audit.pdf', async () => {
      const { envId, signerId } = await draftWithSigner('WP-03 two documents');

      const first = await addDocument(envId, pdfA, 'Contract.pdf').expect(201);
      expect(first.body).toMatchObject({ ord: 1, title: 'Contract', original_pages: 2 });
      expect(first.body.original_sha256).toBe(sha256(pdfA));
      const second = await addDocument(envId, pdfB, 'Annex.pdf').expect(201);
      expect(second.body).toMatchObject({ ord: 2, title: 'Annex', original_pages: 1 });
      const docA: string = first.body.id;
      const docB: string = second.body.id;

      const listed = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/documents`)
        .set(auth())
        .expect(200);
      expect(listed.body.documents.map((d: { id: string }) => d.id)).toEqual([docA, docB]);
      expect(JSON.stringify(listed.body)).not.toMatch(/file_path|\/original\.pdf/);

      await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            {
              signer_id: signerId,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.8,
              document_id: randomUUID(),
            },
          ],
        })
        .expect(400)
        .expect({ error: 'document_not_in_envelope' });

      const placed = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            {
              signer_id: signerId,
              kind: 'signature',
              page: 2,
              x: 0.1,
              y: 0.8,
              width: 0.25,
              height: 0.06,
            },
            {
              signer_id: signerId,
              kind: 'signature',
              page: 1,
              x: 0.5,
              y: 0.5,
              width: 0.25,
              height: 0.06,
              document_id: docB,
            },
          ],
        })
        .expect(200);
      expect(placed.body.fields.map((f: { document_id: string }) => f.document_id)).toEqual([
        docA,
        docB,
      ]);

      const detail = await request(app.getHttpServer())
        .get(`/envelopes/${envId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.documents).toHaveLength(2);
      expect(detail.body.original_sha256).toBe(sha256(pdfA));

      await request(app.getHttpServer()).post(`/envelopes/${envId}/send`).set(auth()).expect(201);
      const invite = outbound.rows.filter((r) => r.kind === 'invite').pop()!;
      const token = await dispatchSignToken(app, invite.to_email);
      const started = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token });
      const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
      const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;

      const me = await request(app.getHttpServer())
        .get('/sign/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.documents.map((d: { id: string }) => d.id)).toEqual([docA, docB]);
      expect(me.body.fields.map((f: { document_id: string }) => f.document_id).sort()).toEqual(
        [docA, docB].sort(),
      );
      const pdfUrl = await request(app.getHttpServer())
        .get(`/sign/pdf?document_id=${docB}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(decodeURIComponent(pdfUrl.body.url)).toContain(`documents/${docB}/original.pdf`);

      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', cookie)
        .expect(204);
      await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'drawn')
        .attach('image', png, { filename: 's.png', contentType: 'image/png' })
        .expect(200);
      await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);

      const hitsBefore = tsa.hits.length;
      await sealing.processSealJob(envId);
      const envelope = envelopesRepo.envelopes.get(envId)!;
      expect(envelope.status).toBe('completed');
      // B-T + B-LTA timestamps for each of the two documents.
      expect(tsa.hits.length - hitsBefore).toBe(4);

      const sealedA = storage.get(`${envId}/sealed.pdf`)!.bytes;
      const sealedB = storage.get(`${envId}/documents/${docB}/sealed.pdf`)!.bytes;
      // With appendCertificate on (it ships on) the same certificate pages
      // follow the original pages of every document; off, the page counts
      // are the originals'.
      const certPages = isFeatureEnabled('appendCertificate')
        ? (await PDFDocument.load(sealedA)).getPageCount() - 2
        : 0;
      if (isFeatureEnabled('appendCertificate')) expect(certPages).toBeGreaterThan(0);
      expect((await PDFDocument.load(sealedA)).getPageCount()).toBe(2 + certPages);
      expect((await PDFDocument.load(sealedB)).getPageCount()).toBe(1 + certPages);
      expectBLta('wp03-document-1.sealed.pdf', sealedA);
      expectBLta('wp03-document-2.sealed.pdf', sealedB);
      expect(envelope.sealed_sha256).toBe(sha256(sealedA));

      const docs = await docsRepo.listByEnvelope(envId);
      expect(docs.map((d) => d.sealed_sha256)).toEqual([sha256(sealedA), sha256(sealedB)]);

      // One audit.pdf for the envelope, with the extra "Documents" page.
      const audit = storage.get(`${envId}/audit.pdf`)!.bytes;
      const auditPages = (await PDFDocument.load(audit)).getPageCount();
      expect(auditPages).toBeGreaterThanOrEqual(5);

      const verify = await request(app.getHttpServer())
        .get(`/verify/${envelope.short_code}`)
        .expect(200);
      expect(verify.body.envelope.sealed_sha256).toBe(sha256(sealedA));
      expect(verify.body.documents).toHaveLength(2);
      for (const d of verify.body.documents) VerifyDocumentSchema.parse(d);
      expect(verify.body.documents.map((d: { sealed_sha256: string }) => d.sealed_sha256)).toEqual([
        sha256(sealedA),
        sha256(sealedB),
      ]);
      expect(
        verify.body.documents.map((d: { original_sha256: string }) => d.original_sha256),
      ).toEqual([sha256(pdfA), sha256(pdfB)]);
      expect(verify.body.documents.every((d: { sealed_url: string | null }) => d.sealed_url)).toBe(
        true,
      );

      const dlB = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/download?document_id=${docB}`)
        .set(auth())
        .expect(200);
      expect(dlB.body).toMatchObject({ kind: 'sealed', document_id: docB });
      expect(decodeURIComponent(dlB.body.url)).toContain(`documents/${docB}/sealed.pdf`);
      const dlOriginal = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/download?document_id=${docB}&kind=original`)
        .set(auth())
        .expect(200);
      expect(decodeURIComponent(dlOriginal.body.url)).toContain(`documents/${docB}/original.pdf`);

      const zip = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/download?kind=zip`)
        .set(auth())
        .expect(200);
      expect(zip.body.kind).toBe('zip');
      const zipBytes = storage.get(`${envId}/sealed-documents.zip`)!.bytes;
      const zipDir = mkdtempSync(join(tmpdir(), 'seald-wp03-zip-'));
      writeFileSync(join(zipDir, 'bundle.zip'), zipBytes);
      const listing = execFileSync('unzip', ['-Z1', join(zipDir, 'bundle.zip')], {
        encoding: 'utf8',
      });
      expect(listing.trim().split('\n')).toEqual(['01 Contract.pdf', '02 Annex.pdf']);
      const test = spawnSync('unzip', ['-tq', join(zipDir, 'bundle.zip')], { encoding: 'utf8' });
      expect(test.status).toBe(0);

      // Every document_added went through appendEvent (S.6).
      const events = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/events`)
        .set(auth())
        .expect(200);
      const added = events.body.events.filter(
        (e: { event_type: string }) => e.event_type === 'document_added',
      );
      expect(
        added.map((e: { metadata: { document_id: string } }) => e.metadata.document_id),
      ).toEqual([docA, docB]);
      expect((await envelopesRepo.verifyEventChain(envId)).chain_intact).toBe(true);
    });

    it('reorders and removes documents on a draft, and guards the last one and the cap', async () => {
      const { envId, signerId } = await draftWithSigner('WP-03 reorder');
      const a = (await addDocument(envId, pdfA, 'A.pdf').expect(201)).body.id as string;
      const b = (await addDocument(envId, pdfB, 'B.pdf').expect(201)).body.id as string;
      await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            { signer_id: signerId, kind: 'signature', page: 1, x: 0.1, y: 0.1 },
            { signer_id: signerId, kind: 'signature', page: 1, x: 0.2, y: 0.2, document_id: b },
          ],
        })
        .expect(200);

      await request(app.getHttpServer())
        .put(`/envelopes/${envId}/documents/order`)
        .set(auth())
        .send({ document_ids: [a] })
        .expect(400)
        .expect({ error: 'document_order_invalid' });
      const reordered = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/documents/order`)
        .set(auth())
        .send({ document_ids: [b, a] })
        .expect(200);
      expect(
        reordered.body.documents.map((d: { id: string; ord: number }) => [d.id, d.ord]),
      ).toEqual([
        [b, 1],
        [a, 2],
      ]);
      // Legacy envelope fields now mirror the new document 1.
      const detail = await request(app.getHttpServer())
        .get(`/envelopes/${envId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.original_sha256).toBe(sha256(pdfB));
      // Fields stay on their documents.
      expect(detail.body.fields.map((f: { document_id: string }) => f.document_id)).toEqual([a, b]);

      // The legacy upload replaces document 1 (now B) at B's own path.
      await request(app.getHttpServer())
        .post(`/envelopes/${envId}/upload`)
        .set(auth())
        .attach('file', pdfA, { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(storage.get(`${envId}/documents/${b}/original.pdf`)!.bytes.equals(pdfA)).toBe(true);
      expect(storage.get(`${envId}/original.pdf`)!.bytes.equals(pdfA)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/envelopes/${envId}/documents/${b}`)
        .set(auth())
        .expect(204);
      const after = await request(app.getHttpServer())
        .get(`/envelopes/${envId}`)
        .set(auth())
        .expect(200);
      expect(after.body.documents.map((d: { id: string; ord: number }) => [d.id, d.ord])).toEqual([
        [a, 1],
      ]);
      expect(after.body.fields.map((f: { document_id: string }) => f.document_id)).toEqual([a]);
      expect(storage.get(`${envId}/documents/${b}/original.pdf`)).toBeUndefined();

      await request(app.getHttpServer())
        .delete(`/envelopes/${envId}/documents/${a}`)
        .set(auth())
        .expect(409)
        .expect({ error: 'last_document' });
      await request(app.getHttpServer())
        .delete(`/envelopes/${envId}/documents/${randomUUID()}`)
        .set(auth())
        .expect(404)
        .expect({ error: 'document_not_found' });

      for (let i = 0; i < 9; i++) await addDocument(envId, pdfB, `extra-${i}.pdf`).expect(201);
      await addDocument(envId, pdfB, 'one-too-many.pdf')
        .expect(409)
        .expect({ error: 'too_many_documents' });
    });

    it('refuses document changes once the envelope is sent', async () => {
      const { envId, signerId } = await draftWithSigner('WP-03 sent');
      await addDocument(envId, pdfA, 'A.pdf').expect(201);
      await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({ fields: [{ signer_id: signerId, kind: 'signature', page: 1, x: 0.1, y: 0.1 }] })
        .expect(200);
      await request(app.getHttpServer()).post(`/envelopes/${envId}/send`).set(auth()).expect(201);
      await addDocument(envId, pdfB, 'late.pdf')
        .expect(409)
        .expect({ error: 'envelope_not_draft' });
    });

    it('a legacy single-file envelope lists exactly one document', async () => {
      const { envId } = await draftWithSigner('WP-03 legacy');
      await request(app.getHttpServer())
        .post(`/envelopes/${envId}/upload`)
        .set(auth())
        .attach('file', pdfA, { filename: 't.pdf', contentType: 'application/pdf' })
        .expect(201);
      const listed = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/documents`)
        .set(auth())
        .expect(200);
      expect(listed.body.documents).toHaveLength(1);
      expect(listed.body.documents[0]).toMatchObject({ ord: 1, original_sha256: sha256(pdfA) });
    });
  });

  describe('flag off', () => {
    beforeAll(() => setFlag('multiDocumentEnvelopes', false));
    afterAll(() => setFlag('multiDocumentEnvelopes', undefined));

    it('404s every documents route, before parsing the body or the id', async () => {
      const { envId } = await draftWithSigner('WP-03 dark');
      await addDocument(envId, pdfA, 'a.pdf').expect(404).expect({ error: 'not_found' });
      await request(app.getHttpServer())
        .get(`/envelopes/${envId}/documents`)
        .set(auth())
        .expect(404);
      await request(app.getHttpServer())
        .get('/envelopes/not-a-uuid/documents')
        .set(auth())
        .expect(404);
      await request(app.getHttpServer())
        .put(`/envelopes/${envId}/documents/order`)
        .set(auth())
        .send({ document_ids: [] })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/envelopes/${envId}/documents/${randomUUID()}`)
        .set(auth())
        .expect(404);
    });

    it('keeps the legacy responses free of documents / document_id', async () => {
      const { envId, signerId } = await draftWithSigner('WP-03 legacy shape');
      await request(app.getHttpServer())
        .post(`/envelopes/${envId}/upload`)
        .set(auth())
        .attach('file', pdfA, { filename: 't.pdf', contentType: 'application/pdf' })
        .expect(201);
      const rejected = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            {
              signer_id: signerId,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.1,
              document_id: randomUUID(),
            },
          ],
        })
        .expect(400);
      expect(rejected.body).toEqual({ error: 'fields.0.property document_id should not exist' });

      const placed = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({ fields: [{ signer_id: signerId, kind: 'signature', page: 1, x: 0.1, y: 0.1 }] })
        .expect(200);
      expect(Object.keys(placed.body.fields[0]).sort()).toEqual(
        [
          'filled_at',
          'height',
          'id',
          'kind',
          'link_id',
          // WP-07 adds `meta` while fieldMetaV2 is on; independent of WP-03.
          ...(isFeatureEnabled('fieldMetaV2') ? ['meta'] : []),
          'page',
          'required',
          'signer_id',
          'value_boolean',
          'value_text',
          'width',
          'x',
          'y',
        ].sort(),
      );
      const detail = await request(app.getHttpServer())
        .get(`/envelopes/${envId}`)
        .set(auth())
        .expect(200);
      expect(detail.body).not.toHaveProperty('documents');
      expect(detail.body.fields[0]).not.toHaveProperty('document_id');
      // Unknown query params stay ignored, as before.
      const dl = await request(app.getHttpServer())
        .get(`/envelopes/${envId}/download?document_id=${randomUUID()}&kind=original`)
        .set(auth())
        .expect(200);
      expect(dl.body).toEqual({ url: expect.any(String), kind: 'original' });

      const verify = await request(app.getHttpServer())
        .get(`/verify/${envelopesRepo.envelopes.get(envId)!.short_code}`)
        .expect(200);
      expect(verify.body).not.toHaveProperty('documents');
    });
  });
});
