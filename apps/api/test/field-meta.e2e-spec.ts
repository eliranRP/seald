import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
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
import { TemplatesRepository } from '../src/templates/templates.repository';
import { dispatchSignToken } from './dispatched-sign-links';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { setFlag, startFakeTsa, tryGenerateP12, TS_NODE_BIN } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * WP-07 field meta + new kinds, end to end through AppModule with a real
 * P12 signer:
 *
 *   - flag on: a draft gets a date format and timezone, eight fields of
 *     every new and changed kind are placed with meta, the signer fills
 *     them (bad values answer 400 slugs), and the sealed PDF carries the
 *     rendered values and passes pades-verify;
 *   - templates round-trip meta;
 *   - flag off: new kinds, meta, date_format and timezone get the legacy
 *     400, and responses carry no `meta` / `date_format`.
 *
 * The sealed PDF lands in ./test-output/ for the CI `pades-verify` job.
 */
const USER_A = '00000000-0000-0000-0000-00000000000a';

const p12 = tryGenerateP12();
const describeOrSkip = p12 ? describe : describe.skip;

const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

/** All decoded content-stream text of a PDF, so a test can look for strings. */
async function streamText(pdf: Buffer): Promise<string> {
  const doc = await PDFDocument.load(pdf);
  const parts: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const filter = obj.dict.get(PDFName.of('Filter'));
    const raw = Buffer.from(obj.getContents());
    try {
      parts.push(
        (filter?.toString() === '/FlateDecode' ? inflateSync(raw) : raw).toString('latin1'),
      );
    } catch {
      /* not a content stream */
    }
  }
  return parts.join('\n');
}

/** How pdf-lib writes a WinAnsi string into a content stream (`<hex> Tj`). */
const hex = (s: string): string => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

describeOrSkip('Field meta + new kinds (e2e, WP-07)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let tsa: { url: string; server: Server; hits: number[] };
  let tokenA: string;
  let png: Buffer;
  const outDir = join(__dirname, '..', 'test-output');
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${tokenA}` });

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
      .useValue(contactsRepo)
      .overrideProvider(TemplatesRepository)
      .useValue(new InMemoryTemplatesRepository())
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
    png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    execFileSync('mkdir', ['-p', outDir]);
  });

  afterAll(async () => {
    setFlag('fieldMetaV2', undefined);
    await app.close();
    await new Promise<void>((r) => tsa.server.close(() => r()));
  });

  async function draftWithPdf(title: string): Promise<{ envId: string; signerId: string }> {
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
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]).drawText('Field meta', { x: 72, y: 700 });
    await request(app.getHttpServer())
      .post(`/envelopes/${env.body.id}/upload`)
      .set(auth())
      .attach('file', Buffer.from(await pdf.save()), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    return { envId: env.body.id, signerId: signer.body.id };
  }

  describe('flag on', () => {
    beforeAll(() => setFlag('fieldMetaV2', true));
    afterAll(() => setFlag('fieldMetaV2', undefined));

    it('places meta, validates fills, and burns the rendered values into a verifiable PDF', async () => {
      const { envId, signerId } = await draftWithPdf('WP-07 meta');

      const patched = await request(app.getHttpServer())
        .patch(`/envelopes/${envId}`)
        .set(auth())
        .send({ date_format: 'dd.MM.yyyy', timezone: 'Asia/Tokyo' })
        .expect(200);
      expect(patched.body).toMatchObject({ date_format: 'dd.MM.yyyy', timezone: 'Asia/Tokyo' });
      await request(app.getHttpServer())
        .patch(`/envelopes/${envId}`)
        .set(auth())
        .send({ date_format: 'YYYY' })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/envelopes/${envId}`)
        .set(auth())
        .send({ timezone: 'Mars/Olympus' })
        .expect(400);

      const at = (
        y: number,
      ): { page: number; x: number; y: number; width: number; height: number } => ({
        page: 1,
        x: 0.1,
        y,
        width: 0.4,
        height: 0.03,
      });
      const bad = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            { signer_id: signerId, kind: 'radio', ...at(0.1) },
            { signer_id: signerId, kind: 'number', ...at(0.2), meta: { min: 9, max: 1 } },
            { signer_id: signerId, kind: 'text', ...at(0.3), meta: { font_size: 200 } },
          ],
        })
        .expect(400);
      expect(JSON.stringify(bad.body)).toContain('fields.0.meta.options');
      expect(JSON.stringify(bad.body)).toContain('fields.1.meta.min: min must not exceed max');
      expect(JSON.stringify(bad.body)).toContain('fields.2.meta.font_size');

      const placed = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            {
              signer_id: signerId,
              kind: 'signature',
              page: 1,
              x: 0.1,
              y: 0.9,
              width: 0.25,
              height: 0.06,
            },
            { signer_id: signerId, kind: 'name', ...at(0.1), meta: { label: 'Full name' } },
            {
              signer_id: signerId,
              kind: 'number',
              ...at(0.2),
              meta: { min: 0, max: 5_000_000, format: 'thousands_fixed2' },
            },
            {
              signer_id: signerId,
              kind: 'radio',
              ...at(0.3),
              meta: { options: OPTIONS, font_size: 14 },
            },
            { signer_id: signerId, kind: 'dropdown', ...at(0.4), meta: { options: OPTIONS } },
            { signer_id: signerId, kind: 'text', ...at(0.5), meta: { char_limit: 8 } },
            { signer_id: signerId, kind: 'date', ...at(0.6) },
            { signer_id: signerId, kind: 'email', ...at(0.7), meta: { required: false } },
          ],
        })
        .expect(200);
      type Placed = { id: string; kind: string; required: boolean; meta?: Record<string, unknown> };
      const byKind = new Map<string, Placed>(
        (placed.body.fields as Placed[]).map((f) => [f.kind, f]),
      );
      expect(byKind.get('number')?.meta).toEqual({
        min: 0,
        max: 5_000_000,
        format: 'thousands_fixed2',
      });
      expect(byKind.get('date')?.meta).toEqual({});
      expect(byKind.get('email')?.required).toBe(false);
      const id = (kind: string): string => byKind.get(kind)!.id;

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
      expect(me.body.envelope).toMatchObject({ date_format: 'dd.MM.yyyy', timezone: 'Asia/Tokyo' });
      expect((me.body.fields as Placed[]).find((f) => f.kind === 'radio')?.meta).toMatchObject({
        font_size: 14,
      });
      await request(app.getHttpServer())
        .post('/sign/accept-terms')
        .set('Cookie', cookie)
        .expect(204);

      const fill = (kind: string, body: Record<string, unknown>): request.Test =>
        request(app.getHttpServer())
          .post(`/sign/fields/${id(kind)}`)
          .set('Cookie', cookie)
          .send(body);
      const rejects = async (kind: string, value: string, code: string): Promise<void> => {
        const res = await fill(kind, { value_text: value }).expect(400);
        expect(JSON.stringify(res.body)).toContain(code);
      };

      await rejects('number', 'lots', 'field_value_not_a_number');
      await rejects('number', '5000001', 'field_value_out_of_range');
      await rejects('radio', 'xl', 'field_value_not_in_options');
      await rejects('dropdown', 'Large', 'field_value_not_in_options');
      await rejects('text', 'far too long', 'field_value_too_long');
      await rejects('date', 'next tuesday', 'field_value_invalid_date');
      await rejects('email', 'ada@', 'field_value_invalid_email');

      const name = await fill('name', { value_text: '   ' }).expect(200);
      expect(name.body.value_text).toBe('Ada Lovelace');
      await fill('number', { value_text: '1234567.5' }).expect(200);
      await fill('radio', { value_text: 'l' }).expect(200);
      await fill('dropdown', { value_text: 's' }).expect(200);
      await fill('text', { value_text: 'ok text' }).expect(200);
      // 23:30 UTC on 5 Jan is already 6 Jan in Tokyo.
      const date = await fill('date', { value_text: '2026-01-05T23:30:00Z' }).expect(200);
      expect(date.body.value_text).toBe('06.01.2026');
      await fill('email', { value_text: 'ada@example.com' }).expect(200);

      await request(app.getHttpServer())
        .post('/sign/signature')
        .set('Cookie', cookie)
        .field('format', 'drawn')
        .attach('image', png, { filename: 's.png', contentType: 'image/png' })
        .expect(200);
      await request(app.getHttpServer()).post('/sign/submit').set('Cookie', cookie).expect(200);

      await sealing.processSealJob(envId);
      expect(envelopesRepo.envelopes.get(envId)!.status).toBe('completed');
      const sealed = storage.get(`${envId}/sealed.pdf`)!.bytes;
      const text = await streamText(sealed);
      for (const rendered of [
        'Ada Lovelace',
        '1,234,567.50',
        'Large',
        'Small',
        'ok text',
        '06.01.2026',
      ]) {
        expect(text).toContain(`<${hex(rendered)}>`);
      }

      const name2 = 'wp07-field-meta.sealed.pdf';
      writeFileSync(join(outDir, name2), sealed);
      const dir = mkdtempSync(join(tmpdir(), 'seald-wp07-verify-'));
      writeFileSync(join(dir, name2), sealed);
      const verify = spawnSync(
        process.execPath,
        [TS_NODE_BIN, '--transpile-only', 'scripts/verify-pades.ts', dir],
        { cwd: join(__dirname, '..'), encoding: 'utf8' },
      );
      expect(verify.stdout).toContain(`[PASS] ${name2}`);
      expect(verify.status).toBe(0);
      expect((await envelopesRepo.verifyEventChain(envId)).chain_intact).toBe(true);
    });

    it('read-only fields accept only their default', async () => {
      const { envId, signerId } = await draftWithPdf('WP-07 read only');
      const placed = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [
            { signer_id: signerId, kind: 'signature', page: 1, x: 0.1, y: 0.9 },
            {
              signer_id: signerId,
              kind: 'text',
              page: 1,
              x: 0.1,
              y: 0.1,
              meta: { read_only: true, default: 'Acme Corp' },
            },
          ],
        })
        .expect(200);
      const textId = (placed.body.fields as Array<{ id: string; kind: string }>).find(
        (f) => f.kind === 'text',
      )!.id;
      await request(app.getHttpServer()).post(`/envelopes/${envId}/send`).set(auth()).expect(201);
      const invite = outbound.rows.filter((r) => r.kind === 'invite').pop()!;
      const token = await dispatchSignToken(app, invite.to_email);
      const started = await request(app.getHttpServer())
        .post('/sign/start')
        .send({ envelope_id: envId, token });
      const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
      const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
      const fill = (value: string): request.Test =>
        request(app.getHttpServer())
          .post(`/sign/fields/${textId}`)
          .set('Cookie', cookie)
          .send({ value_text: value });
      const res = await fill('Other Corp').expect(400);
      expect(JSON.stringify(res.body)).toContain('field_read_only');
      await fill('Acme Corp').expect(200);
    });

    it('templates round-trip meta and the new types', async () => {
      const layout = [
        {
          type: 'dropdown',
          pageRule: 'first',
          x: 10,
          y: 20,
          meta: { options: OPTIONS, default: 's' },
        },
        { type: 'number', pageRule: 'last', x: 30, y: 40, meta: { min: 1, max: 9 } },
        { type: 'text', pageRule: 'first', x: 1, y: 2 },
      ];
      const created = await request(app.getHttpServer())
        .post('/templates')
        .set(auth())
        .send({ title: 'WP-07 template', field_layout: layout })
        .expect(201);
      expect(created.body.field_layout).toEqual(layout);
      const read = await request(app.getHttpServer())
        .get(`/templates/${created.body.id}`)
        .set(auth())
        .expect(200);
      expect(read.body.field_layout).toEqual(layout);
      const applied = await request(app.getHttpServer())
        .post(`/templates/${created.body.id}/apply`)
        .set(auth())
        .send({ totalPages: 3 })
        .expect(200);
      expect(
        applied.body.fields.map((f: { type: string; meta?: unknown }) => [f.type, f.meta]),
      ).toEqual([
        ['dropdown', { options: OPTIONS, default: 's' }],
        ['number', { min: 1, max: 9 }],
        ['text', undefined],
      ]);
      await request(app.getHttpServer())
        .post('/templates')
        .set(auth())
        .send({ title: 'bad', field_layout: [{ type: 'radio', pageRule: 'first', x: 1, y: 1 }] })
        .expect(400);
      const updated = await request(app.getHttpServer())
        .patch(`/templates/${created.body.id}`)
        .set(auth())
        .send({
          field_layout: [
            { type: 'number', pageRule: 'first', x: 1, y: 1, meta: { min: 5, max: 1 } },
          ],
        })
        .expect(400);
      expect(JSON.stringify(updated.body)).toContain('field_layout.0.meta.min');
    });
  });

  describe('flag off', () => {
    beforeAll(() => setFlag('fieldMetaV2', false));
    afterAll(() => setFlag('fieldMetaV2', undefined));

    it('refuses new kinds, meta, date_format and timezone with the legacy 400s and adds nothing to responses', async () => {
      const { envId, signerId } = await draftWithPdf('WP-07 dark');

      const kind = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({ fields: [{ signer_id: signerId, kind: 'radio', page: 1, x: 0.1, y: 0.1 }] })
        .expect(400);
      expect(kind.body).toEqual({
        error:
          'fields.0.kind must be one of the following values: signature, initials, date, text, checkbox, email',
      });
      const meta = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({
          fields: [{ signer_id: signerId, kind: 'text', page: 1, x: 0.1, y: 0.1, meta: {} }],
        })
        .expect(400);
      expect(meta.body).toEqual({ error: 'fields.0.property meta should not exist' });
      const patch = await request(app.getHttpServer())
        .patch(`/envelopes/${envId}`)
        .set(auth())
        .send({ date_format: 'dd.MM.yyyy' })
        .expect(400);
      expect(patch.body).toEqual({ error: 'property date_format should not exist' });
      await request(app.getHttpServer())
        .post('/templates')
        .set(auth())
        .send({ title: 't', field_layout: [{ type: 'radio', pageRule: 'first', x: 1, y: 1 }] })
        .expect(400);

      const placed = await request(app.getHttpServer())
        .put(`/envelopes/${envId}/fields`)
        .set(auth())
        .send({ fields: [{ signer_id: signerId, kind: 'text', page: 1, x: 0.1, y: 0.1 }] })
        .expect(200);
      expect(placed.body.fields[0]).not.toHaveProperty('meta');
      const detail = await request(app.getHttpServer())
        .get(`/envelopes/${envId}`)
        .set(auth())
        .expect(200);
      expect(detail.body).not.toHaveProperty('date_format');
      expect(detail.body).not.toHaveProperty('timezone');
      expect(detail.body.fields[0]).not.toHaveProperty('meta');
    });
  });
});
