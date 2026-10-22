import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import {
  BULK_SEND_MAX_FILE_BYTES,
  BULK_SEND_MAX_ROWS,
  type BulkBatch,
  type FeatureFlag,
} from 'shared';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { BulkRepository } from '../src/bulk/bulk.repository';
import { BulkWorkerService } from '../src/bulk/bulk-worker.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { dispatchSignLinks } from './dispatched-sign-links';
import { InMemoryBulkRepository } from './in-memory-bulk-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
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
  CRON_SECRET: 's'.repeat(48),
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
  BULK_SEND_ROWS_PER_MINUTE: 4,
};

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const HEAD = 'recipient_1_name,recipient_1_email,recipient_2_name,recipient_2_email,title';
const good = (n: number): string =>
  `Landlord ${n},landlord${n}@example.com,Tenant ${n},tenant${n}@example.com,Lease ${n}`;

describe('Bulk send from a template (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let templatesRepo: InMemoryTemplatesRepository;
  let bulkRepo: InMemoryBulkRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tokenB: string;
  let pdfBytes: Buffer;
  let templateId: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    templatesRepo = new InMemoryTemplatesRepository();
    bulkRepo = new InMemoryBulkRepository();
    storage = new InMemoryStorageService();
    outbound = new InMemoryOutboundEmailsRepository();

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
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(TemplatesRepository)
      .useValue(templatesRepo)
      .overrideProvider(BulkRepository)
      .useValue(bulkRepo)
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
    tokenB = await tk.sign(
      { sub: USER_B, email: 'other@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i += 1) doc.addPage([612, 792]);
    pdfBytes = Buffer.from(await doc.save());
  });

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { bulkSend: true };
    envelopesRepo.reset();
    templatesRepo.reset();
    bulkRepo.reset();
    storage.reset();
    outbound.reset();
    templateId = await createTemplate();
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createTemplate(opts: { example?: boolean } = {}): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/templates')
      .set(auth(tokenA))
      .send({
        title: 'Lease agreement',
        field_layout: [
          { type: 'signature', pageRule: 'last', x: 60, y: 500, signerRoleId: 'landlord' },
          { type: 'date', pageRule: 'last', x: 320, y: 500, signerRoleId: 'landlord' },
          { type: 'signature', pageRule: 'last', x: 60, y: 600, signerRoleId: 'tenant' },
          { type: 'initial', pageRule: 'allButLast', x: 500, y: 40, signerRoleId: 'tenant' },
        ],
        last_signers: [
          { id: 'landlord', name: 'Landlord', email: 'l@example.com', color: '#112233' },
          { id: 'tenant', name: 'Tenant', email: 't@example.com', color: '#445566' },
        ],
      })
      .expect(201);
    const id = res.body.id as string;
    if (opts.example !== false) {
      await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set(auth(tokenA))
        .attach('file', pdfBytes, { filename: 'example.pdf', contentType: 'application/pdf' })
        .expect(200);
    }
    return id;
  }

  async function upload(
    csv: string | Buffer,
    extra: Record<string, string> = {},
    token = tokenA,
    id = templateId,
  ): Promise<request.Test> {
    let req = request(app.getHttpServer())
      .post(`/templates/${id}/bulk-batches`)
      .set(auth(token))
      .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), {
        filename: 'recipients.csv',
        contentType: 'text/csv',
      });
    for (const [k, v] of Object.entries(extra)) req = req.field(k, v);
    return req;
  }

  async function preview(csv: string, extra: Record<string, string> = {}): Promise<BulkBatch> {
    const res = await upload(csv, extra);
    expect(res.status).toBe(201);
    return res.body as BulkBatch;
  }

  async function confirm(id: string): Promise<request.Response> {
    return request(app.getHttpServer()).post(`/bulk-batches/${id}/confirm`).set(auth(tokenA));
  }

  async function status(id: string): Promise<BulkBatch> {
    const res = await request(app.getHttpServer()).get(`/bulk-batches/${id}`).set(auth(tokenA));
    expect(res.status).toBe(200);
    return res.body as BulkBatch;
  }

  const worker = () => app.get(BulkWorkerService);

  describe('flag off', () => {
    it('404s every route and creates nothing', async () => {
      host.__SEALD_FEATURE_OVERRIDES__ = { bulkSend: false };
      const server = app.getHttpServer();
      const id = '00000000-0000-4000-8000-0000000000aa';
      await request(server)
        .get(`/templates/${templateId}/bulk-schema`)
        .set(auth(tokenA))
        .expect(404);
      const up = await upload(`${HEAD}\n${good(1)}\n`);
      expect(up.status).toBe(404);
      await request(server).get(`/bulk-batches/${id}`).set(auth(tokenA)).expect(404);
      await request(server).post(`/bulk-batches/${id}/confirm`).set(auth(tokenA)).expect(404);
      await request(server).post(`/bulk-batches/${id}/cancel`).set(auth(tokenA)).expect(404);
      expect(bulkRepo.batches.size).toBe(0);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get(`/templates/${templateId}/bulk-schema`).expect(401);
    });
  });

  describe('schema and preview', () => {
    it('describes the CSV columns in the template roster order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/templates/${templateId}/bulk-schema`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body).toMatchObject({
        template_title: 'Lease agreement',
        max_rows: BULK_SEND_MAX_ROWS,
        max_file_bytes: BULK_SEND_MAX_FILE_BYTES,
        optional_columns: ['title'],
      });
      expect(res.body.slots).toEqual([
        {
          slot: 1,
          label: 'Landlord',
          name_column: 'recipient_1_name',
          email_column: 'recipient_1_email',
        },
        {
          slot: 2,
          label: 'Tenant',
          name_column: 'recipient_2_name',
          email_column: 'recipient_2_email',
        },
      ]);
    });

    it('validates every row and sends nothing until confirmed', async () => {
      const batch = await preview(
        [
          HEAD,
          good(1),
          'Bad,not-an-email,Tenant 2,tenant2@example.com,',
          'Dup,same@example.com,Dup2,SAME@example.com,',
          ',,,,',
          good(5),
        ].join('\r\n'),
      );
      expect(batch.status).toBe('preview');
      expect(batch.confirmable).toBe(true);
      expect(batch.counts).toMatchObject({ total: 4, invalid: 2, pending: 2, sent: 0 });
      expect(batch.rows.map((r) => [r.row, r.status])).toEqual([
        [1, 'pending'],
        [2, 'invalid'],
        [3, 'invalid'],
        // the blank line is row 4 in the spreadsheet, so the next row is 5
        [5, 'pending'],
      ]);
      expect(batch.rows[1]?.errors.map((e) => e.code)).toEqual(['bad_email']);
      expect(batch.rows[2]?.errors.map((e) => [e.code, e.column])).toEqual([
        ['duplicate_email', 'recipient_2_email'],
      ]);
      expect([...bulkRepo.rows.values()].every((r) => r.envelope_id === null)).toBe(true);
      expect(outbound.rows).toHaveLength(0);
      const flush = await worker().flushOnce();
      expect(flush.claimed).toBe(0);
    });

    it('reports a missing column on every row and cannot be confirmed', async () => {
      const batch = await preview(
        'recipient_1_name,recipient_1_email\nAda,ada@example.com\nBob,bob@example.com\n',
      );
      expect(batch.column_errors.map((e) => e.column)).toEqual([
        'recipient_2_name',
        'recipient_2_email',
      ]);
      expect(batch.counts.invalid).toBe(2);
      expect(batch.confirmable).toBe(false);
      const res = await confirm(batch.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('bulk_no_valid_rows');
    });

    it('lists unused columns as ignored', async () => {
      const batch = await preview(`${HEAD},notes\n${good(1)},hello\n`);
      expect(batch.ignored_columns).toEqual(['notes']);
      expect(batch.counts.invalid).toBe(0);
    });

    it('enforces the row cap, the file cap and basic file checks', async () => {
      const rows = Array.from({ length: BULK_SEND_MAX_ROWS + 1 }, (_, i) => good(i + 1));
      const tooMany = await upload(`${HEAD}\n${rows.join('\n')}\n`);
      expect(tooMany.status).toBe(422);
      expect(tooMany.body.error).toBe('bulk_too_many_rows');

      const atCap = await upload(`${HEAD}\n${rows.slice(0, BULK_SEND_MAX_ROWS).join('\n')}\n`);
      expect(atCap.status).toBe(201);

      const huge = await upload(`${HEAD}\n${'x'.repeat(BULK_SEND_MAX_FILE_BYTES)}\n`);
      expect(huge.status).toBe(413);
      expect(huge.body.error).toBe('bulk_file_too_large');

      const headerOnly = await upload(`${HEAD}\n`);
      expect(headerOnly.status).toBe(400);
      expect(headerOnly.body.error).toBe('bulk_csv_no_rows');

      const broken = await upload(`${HEAD}\n"unterminated,x\n`);
      expect(broken.status).toBe(400);
      expect(broken.body.error).toBe('bulk_csv_malformed');

      const latin1 = await upload(Buffer.from([0x61, 0x2c, 0xe9, 0x0a, 0x62, 0x2c, 0xe9]));
      expect(latin1.status).toBe(400);
      expect(latin1.body.error).toBe('bulk_csv_not_utf8');

      const none = await request(app.getHttpServer())
        .post(`/templates/${templateId}/bulk-batches`)
        .set(auth(tokenA));
      expect(none.status).toBe(400);
      expect(none.body.error).toBe('bulk_csv_required');
    });

    it('refuses a template with no example document, or one that is not the sender’s', async () => {
      const bare = await createTemplate({ example: false });
      const noPdf = await upload(`${HEAD}\n${good(1)}\n`, {}, tokenA, bare);
      expect(noPdf.status).toBe(422);
      expect(noPdf.body.error).toBe('template_has_no_example_pdf');
      const foreign = await upload(`${HEAD}\n${good(1)}\n`, {}, tokenB);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error).toBe('template_not_found');
    });

    it('rejects options the flags do not allow', async () => {
      const csv = `${HEAD}\n${good(1)}\n`;
      expect((await upload(csv, { signing_order: 'sequential' })).status).toBe(400);
      expect((await upload(csv, { reminder_first_after_days: '2' })).status).toBe(400);
      expect((await upload(csv, { expires_in_days: '400' })).status).toBe(400);
      expect((await upload(csv, { expires_in_days: '14' })).status).toBe(201);
    });
  });

  describe('confirm, send and summary', () => {
    it('creates and sends one envelope per valid row from the template', async () => {
      const batch = await preview(
        [HEAD, good(1), 'Bad,nope,Tenant 2,t2@example.com,', good(3)].join('\n'),
      );
      const confirmed = await confirm(batch.id);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.status).toBe('processing');
      // repeating confirm is harmless
      expect((await confirm(batch.id)).status).toBe(200);

      const flush = await worker().flushOnce(10);
      expect(flush).toMatchObject({ claimed: 2, sent: 2, failed: 0 });

      const done = await status(batch.id);
      expect(done.status).toBe('completed');
      expect(done.counts).toMatchObject({ sent: 2, invalid: 1, pending: 0, failed: 0 });
      const sentRows = done.rows.filter((r) => r.status === 'sent');
      expect(sentRows).toHaveLength(2);

      const first = sentRows[0];
      const envelope = await envelopesRepo.findByIdWithAll(first?.envelope_id ?? '');
      expect(envelope).not.toBeNull();
      expect(envelope?.status).toBe('awaiting_others');
      expect(envelope?.title).toBe('Lease 1');
      expect(envelope?.sender_email).toBe('sender@example.com');
      expect(envelope?.original_pages).toBe(3);
      expect(envelope?.signers.map((s) => [s.name, s.email])).toEqual([
        ['Landlord 1', 'landlord1@example.com'],
        ['Tenant 1', 'tenant1@example.com'],
      ]);
      // 1 date + 1 signature for the landlord, 1 signature + 2 initials for the tenant.
      const [landlord, tenant] = envelope?.signers ?? [];
      const byKind = (id: string | undefined) =>
        envelope?.fields
          .filter((f) => f.signer_id === id)
          .map((f) => f.kind)
          .sort();
      expect(byKind(landlord?.id)).toEqual(['date', 'signature']);
      expect(byKind(tenant?.id)).toEqual(['initials', 'initials', 'signature']);
      for (const f of envelope?.fields ?? []) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(1);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeLessThanOrEqual(1);
      }

      // Two invites per envelope (parallel), none for the invalid row.
      const links = await dispatchSignLinks(app);
      expect(links.map((l) => l.to).sort()).toEqual([
        'landlord1@example.com',
        'landlord3@example.com',
        'tenant1@example.com',
        'tenant3@example.com',
      ]);

      // The template's use count went up once per sent envelope.
      const t = await templatesRepo.findOneByOwner(USER_A, templateId);
      expect(t?.uses_count).toBe(2);
    });

    it('emails the sender one summary and never repeats it', async () => {
      const batch = await preview([HEAD, good(1), good(2)].join('\n'));
      await confirm(batch.id);
      await worker().flushOnce(10);
      await worker().flushOnce(10);
      await worker().flushOnce(10);
      const summaries = outbound.rows.filter((r) => r.kind === 'bulk_complete');
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        to_email: 'sender@example.com',
        dedupe_key: `bulk_complete:${batch.id}`,
      });
      expect(summaries[0]?.payload).toMatchObject({
        template_title: 'Lease agreement',
        outcome_word: 'complete',
        sent_count: 2,
        failed_count: 0,
        total_count: 2,
      });
      expect(String(summaries[0]?.payload['batch_url'])).toBe(
        `http://localhost:5173/templates/${templateId}/bulk-send/${batch.id}`,
      );
    });

    it('fails the rows when the template is deleted before sending, and lists them in the summary', async () => {
      const batch = await preview([HEAD, good(1)].join('\n'));
      await confirm(batch.id);
      await templatesRepo.delete(USER_A, templateId);
      const flush = await worker().flushOnce(10);
      expect(flush).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
      const done = await status(batch.id);
      expect(done.rows[0]).toMatchObject({ status: 'failed', error_code: 'template_not_found' });
      const summary = outbound.rows.find((r) => r.kind === 'bulk_complete');
      expect(summary?.payload).toMatchObject({
        outcome_word: 'complete with errors',
        failed_count: 1,
      });
      expect(String(summary?.payload['failed_rows_text'])).toContain('Row 1');
    });

    it('throttles to the configured rows per minute across flushes', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => good(i + 1));
      const batch = await preview([HEAD, ...rows].join('\n'));
      await confirm(batch.id);
      const t0 = new Date('2026-10-22T12:00:00Z');
      const first = await worker().flushOnce(10, () => t0);
      expect(first.claimed).toBe(4); // BULK_SEND_ROWS_PER_MINUTE
      expect((await status(batch.id)).counts).toMatchObject({ sent: 4, pending: 2 });
      // Inside the same minute nothing more is claimed.
      const same = await worker().flushOnce(10, () => new Date(t0.getTime() + 30_000));
      expect(same.claimed).toBe(0);
      // A minute later the rest goes out.
      const later = await worker().flushOnce(10, () => new Date(t0.getTime() + 61_000));
      expect(later.claimed).toBe(2);
      expect((await status(batch.id)).status).toBe('completed');
    });

    it('applies the expiry and sequential order chosen at upload', async () => {
      host.__SEALD_FEATURE_OVERRIDES__ = { bulkSend: true, signingOrder: true };
      const batch = await preview(`${HEAD}\n${good(1)}\n`, {
        expires_in_days: '7',
        signing_order: 'sequential',
      });
      await confirm(batch.id);
      const t0 = new Date('2026-10-22T12:00:00Z');
      await worker().flushOnce(10, () => t0);
      const done = await status(batch.id);
      const envelope = await envelopesRepo.findByIdWithAll(done.rows[0]?.envelope_id ?? '');
      expect(envelope?.delivery_mode).toBe('sequential');
      expect(envelope?.signers.map((s) => s.signing_order)).toEqual([1, 2]);
      expect(Date.parse(envelope?.expires_at ?? '')).toBe(t0.getTime() + 7 * 86_400_000);
      // Only the first step is invited.
      const links = await dispatchSignLinks(app);
      expect(links.map((l) => l.to)).toEqual(['landlord1@example.com']);
    });
  });

  describe('restart safety', () => {
    it('resumes a crashed row on its existing envelope and never sends twice', async () => {
      const batch = await preview([HEAD, good(1), good(2)].join('\n'));
      await confirm(batch.id);
      const t0 = new Date('2026-10-22T12:00:00Z');

      // Crash after the envelope was sent but before the row was marked: the
      // process dies, so the row stays `processing` with its lock.
      const crash = jest
        .spyOn(bulkRepo, 'markRowSent')
        .mockRejectedValueOnce(new Error('process killed'));
      await expect(worker().flushOnce(1, () => t0)).rejects.toThrow('process killed');
      crash.mockRestore();
      const mid = [...bulkRepo.rows.values()].filter((r) => r.status === 'processing');
      expect(mid).toHaveLength(1);
      const crashedEnvelope = mid[0]?.envelope_id;
      expect(crashedEnvelope).toBeTruthy();

      // A fresh worker, after the lock went stale, takes the row over.
      const later = () => new Date(t0.getTime() + 11 * 60_000);
      const flush = await worker().flushOnce(10, later);
      expect(flush.claimed).toBe(2);
      expect(flush.sent).toBe(2);

      const done = await status(batch.id);
      expect(done.counts).toMatchObject({ sent: 2, failed: 0 });
      expect(done.rows[0]?.envelope_id).toBe(crashedEnvelope);
      // Exactly one envelope per row, one invite per signer.
      const all = [...bulkRepo.rows.values()].map((r) => r.envelope_id);
      expect(new Set(all).size).toBe(2);
      const invites = outbound.rows.filter((r) => r.kind === 'invite');
      expect(invites).toHaveLength(4);
      expect(outbound.rows.filter((r) => r.kind === 'bulk_complete')).toHaveLength(1);
    });

    it('resumes a draft left half built without making a second envelope', async () => {
      const batch = await preview(`${HEAD}\n${good(1)}\n`);
      await confirm(batch.id);
      const t0 = new Date('2026-10-22T12:00:00Z');
      // The database errors while placing fields, after the draft and signers exist.
      const spy = jest
        .spyOn(envelopesRepo, 'replaceFields')
        .mockRejectedValueOnce(new Error('process killed'));
      // An unexpected error is transient: the row is released for a retry.
      const first = await worker().flushOnce(1, () => t0);
      spy.mockRestore();
      expect(first).toMatchObject({ claimed: 1, retried: 1 });
      const row = [...bulkRepo.rows.values()][0];
      expect(row?.status).toBe('pending');
      const draftId = row?.envelope_id;
      expect(draftId).toBeTruthy();

      const second = await worker().flushOnce(1, () => new Date(t0.getTime() + 61_000));
      expect(second).toMatchObject({ claimed: 1, sent: 1 });
      expect([...bulkRepo.rows.values()][0]?.envelope_id).toBe(draftId);
      const envelope = await envelopesRepo.findByIdWithAll(draftId ?? '');
      expect(envelope?.signers).toHaveLength(2);
      expect(envelope?.status).toBe('awaiting_others');
    });

    it('gives up on a row after three attempts', async () => {
      const batch = await preview(`${HEAD}\n${good(1)}\n`);
      await confirm(batch.id);
      jest.spyOn(envelopesRepo, 'replaceFields').mockRejectedValue(new Error('db down'));
      let now = new Date('2026-10-22T12:00:00Z');
      for (let i = 0; i < 3; i += 1) {
        await worker().flushOnce(1, () => now);
        now = new Date(now.getTime() + 61_000);
      }
      jest.restoreAllMocks();
      const done = await status(batch.id);
      expect(done.rows[0]).toMatchObject({ status: 'failed', error_code: 'attempts_exhausted' });
      expect(done.status).toBe('completed');
    });
  });

  describe('cancel', () => {
    it('stops the rows not sent yet and emails a summary', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => good(i + 1));
      const batch = await preview([HEAD, ...rows].join('\n'));
      await confirm(batch.id);
      const t0 = new Date('2026-10-22T12:00:00Z');
      await worker().flushOnce(10, () => t0); // 4 sent (throttle)
      const res = await request(app.getHttpServer())
        .post(`/bulk-batches/${batch.id}/cancel`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body.status).toBe('canceled');
      expect(res.body.counts).toMatchObject({ sent: 4, canceled: 2, pending: 0 });
      const flush = await worker().flushOnce(10, () => new Date(t0.getTime() + 61_000));
      expect(flush.claimed).toBe(0);
      const summaries = outbound.rows.filter((r) => r.kind === 'bulk_complete');
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.payload).toMatchObject({
        outcome_word: 'canceled',
        sent_count: 4,
        canceled_count: 2,
      });
      // Cancel again: nothing changes.
      await request(app.getHttpServer())
        .post(`/bulk-batches/${batch.id}/cancel`)
        .set(auth(tokenA))
        .expect(200);
      expect(outbound.rows.filter((r) => r.kind === 'bulk_complete')).toHaveLength(1);
    });

    it('cancels a preview without a summary, and a completed batch cannot be canceled', async () => {
      const preview1 = await preview(`${HEAD}\n${good(1)}\n`);
      await request(app.getHttpServer())
        .post(`/bulk-batches/${preview1.id}/cancel`)
        .set(auth(tokenA))
        .expect(200);
      expect(outbound.rows.filter((r) => r.kind === 'bulk_complete')).toHaveLength(0);
      const again = await confirm(preview1.id);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe('bulk_batch_canceled');

      const batch = await preview(`${HEAD}\n${good(2)}\n`);
      await confirm(batch.id);
      await worker().flushOnce(10);
      const res = await request(app.getHttpServer())
        .post(`/bulk-batches/${batch.id}/cancel`)
        .set(auth(tokenA));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('bulk_batch_completed');
    });
  });

  describe('ownership', () => {
    it('hides a batch from other users on every route', async () => {
      const batch = await preview(`${HEAD}\n${good(1)}\n`);
      const server = app.getHttpServer();
      await request(server).get(`/bulk-batches/${batch.id}`).set(auth(tokenB)).expect(404);
      await request(server).post(`/bulk-batches/${batch.id}/confirm`).set(auth(tokenB)).expect(404);
      await request(server).post(`/bulk-batches/${batch.id}/cancel`).set(auth(tokenB)).expect(404);
      await request(server).get('/bulk-batches/not-a-uuid').set(auth(tokenA)).expect(400);
    });
  });

  it('refuses to confirm once the template changed signer count', async () => {
    const batch = await preview(`${HEAD}\n${good(1)}\n`);
    await request(app.getHttpServer())
      .patch(`/templates/${templateId}`)
      .set(auth(tokenA))
      .send({
        field_layout: [
          { type: 'signature', pageRule: 'last', x: 60, y: 500, signerRoleId: 'landlord' },
        ],
      })
      .expect(200);
    const res = await confirm(batch.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('bulk_template_changed');
  });
});
