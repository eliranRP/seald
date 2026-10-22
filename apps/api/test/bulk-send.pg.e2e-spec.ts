import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import type { BulkBatch, FeatureFlag } from 'shared';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { BulkRepository } from '../src/bulk/bulk.repository';
import { BulkWorkerService } from '../src/bulk/bulk-worker.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { EnvelopesService } from '../src/envelopes/envelopes.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * Bulk send (WP-36, migration 0032) end to end on real Postgres: the whole
 * HTTP flow, the `for update skip locked` claim under two concurrent workers,
 * the per-minute throttle, restart idempotency (a worker killed mid-row never
 * double-sends, and a resumed row reuses its envelope), RLS, and the down
 * script.
 *
 * Its own scratch database on the server named by SUBMIT_SIGNER_DATABASE_URL;
 * skipped when unset locally, fails in CI when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `bulk_send_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the bulk-send pg spec');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const HEAD = 'recipient_1_name,recipient_1_email,recipient_2_name,recipient_2_email';
const row = (n: number, tag = 'a') =>
  `Landlord ${n},l${n}.${tag}@example.com,Tenant ${n},t${n}.${tag}@example.com`;

describePg('bulk send (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let app: INestApplication;
  let tokenA: string;
  let pdfBytes: Buffer;
  const storage = new InMemoryStorageService();
  const owner = randomUUID();
  let templateId = '';

  const q = (text: string, values: unknown[] = []) => {
    if (!pool) throw new Error('pool not ready');
    return pool.query(text, values);
  };
  const auth = () => ({ Authorization: `Bearer ${tokenA}` });
  const worker = () => app.get(BulkWorkerService);

  async function migrate(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: MIGRATIONS },
    });
  }

  async function preview(csv: string): Promise<BulkBatch> {
    const res = await request(app.getHttpServer())
      .post(`/templates/${templateId}/bulk-batches`)
      .set(auth())
      .attach('file', Buffer.from(csv), { filename: 'r.csv', contentType: 'text/csv' });
    expect(res.status).toBe(201);
    return res.body as BulkBatch;
  }

  async function confirm(id: string): Promise<void> {
    await request(app.getHttpServer()).post(`/bulk-batches/${id}/confirm`).set(auth()).expect(200);
  }

  async function counts(batchId: string) {
    const envelopes = await q(
      `select count(*)::int as n from envelopes e
        where e.id in (select envelope_id from bulk_batch_rows where batch_id = $1)`,
      [batchId],
    );
    const sent = await q(
      `select count(*)::int as n from envelopes e
        where e.status = 'awaiting_others'
          and e.id in (select envelope_id from bulk_batch_rows where batch_id = $1)`,
      [batchId],
    );
    const invites = await q(
      `select count(*)::int as n from outbound_emails
        where kind = 'invite'
          and envelope_id in (select envelope_id from bulk_batch_rows where batch_id = $1)`,
      [batchId],
    );
    const summaries = await q(
      `select count(*)::int as n from outbound_emails where dedupe_key = $1`,
      [`bulk_complete:${batchId}`],
    );
    return {
      envelopes: envelopes.rows[0].n as number,
      sent: sent.rows[0].n as number,
      invites: invites.rows[0].n as number,
      summaries: summaries.rows[0].n as number,
    };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    host.__SEALD_FEATURE_OVERRIDES__ = { bulkSend: true };
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 6 });
    pool.on('error', () => undefined);
    await q(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key, email text);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrate();
    await q('insert into auth.users (id, email) values ($1, $2)', [owner, 'sender@example.com']);

    const appUrl = new URL(dedicatedUrl);
    appUrl.searchParams.set('sslmode', 'disable');
    const env: AppEnv = {
      NODE_ENV: 'test',
      PORT: 0,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      CORS_ORIGIN: 'http://localhost:5173',
      APP_PUBLIC_URL: 'http://localhost:5173',
      DATABASE_URL: appUrl.toString(),
      STORAGE_BUCKET: 'envelopes',
      TC_VERSION: '2026-04-24',
      PRIVACY_VERSION: '2026-04-24',
      SIGNER_SESSION_SECRET: 'x'.repeat(64),
      CRON_SECRET: 'c'.repeat(48),
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
      BULK_SEND_ROWS_PER_MINUTE: 100,
    };
    const tk = await buildTestJwks();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(env)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tokenA = await tk.sign(
      { sub: owner, email: 'sender@example.com' },
      { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: env.SUPABASE_JWT_AUDIENCE },
    );
    const doc = await PDFDocument.create();
    for (let i = 0; i < 2; i += 1) doc.addPage([612, 792]);
    pdfBytes = Buffer.from(await doc.save());

    const created = await request(app.getHttpServer())
      .post('/templates')
      .set(auth())
      .send({
        title: 'Lease',
        field_layout: [
          { type: 'signature', pageRule: 'last', x: 60, y: 500, signerRoleId: 'l' },
          { type: 'signature', pageRule: 'last', x: 60, y: 600, signerRoleId: 't' },
        ],
        last_signers: [
          { id: 'l', name: 'Landlord', email: 'l@example.com', color: '#112233' },
          { id: 't', name: 'Tenant', email: 't@example.com', color: '#445566' },
        ],
      })
      .expect(201);
    templateId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/templates/${templateId}/example`)
      .set(auth())
      .attach('file', pdfBytes, { filename: 'e.pdf', contentType: 'application/pdf' })
      .expect(200);
  }, 180_000);

  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await app?.close();
    // The forced drop can terminate an idle pooled client.
    pool?.on('error', () => undefined);
    await pool?.end().catch(() => undefined);
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('creates both tables with RLS on, and the bulk_complete kind', async () => {
    for (const table of ['bulk_batches', 'bulk_batch_rows']) {
      const rls = await q(`select relrowsecurity from pg_class where oid = $1::regclass`, [
        `public.${table}`,
      ]);
      expect(rls.rows[0]?.relrowsecurity).toBe(true);
    }
    const kinds = await q(`select unnest(enum_range(null::email_kind))::text as label`);
    expect(kinds.rows.map((r) => r.label)).toContain('bulk_complete');
  });

  it('runs the whole flow: preview, confirm, send, summary', async () => {
    const batch = await preview([HEAD, row(1), 'Bad,nope,Tenant,t@example.com', row(3)].join('\n'));
    expect(batch.counts).toMatchObject({ total: 3, invalid: 1, pending: 2 });
    await confirm(batch.id);
    const flush = await worker().flushOnce(10);
    expect(flush).toMatchObject({ claimed: 2, sent: 2, failed: 0 });

    const res = await request(app.getHttpServer())
      .get(`/bulk-batches/${batch.id}`)
      .set(auth())
      .expect(200);
    expect((res.body as BulkBatch).status).toBe('completed');
    expect(await counts(batch.id)).toEqual({ envelopes: 2, sent: 2, invites: 4, summaries: 1 });

    const fields = await q(
      `select count(*)::int as n from envelope_fields f
        where f.envelope_id in (select envelope_id from bulk_batch_rows where batch_id = $1)`,
      [batch.id],
    );
    expect(fields.rows[0]?.n).toBe(4);
    const events = await q(
      `select count(*)::int as n from envelope_events ev
        where ev.event_type = 'sent'
          and ev.envelope_id in (select envelope_id from bulk_batch_rows where batch_id = $1)`,
      [batch.id],
    );
    expect(events.rows[0]?.n).toBe(4);

    // Repeating the worker changes nothing.
    await worker().flushOnce(10);
    expect(await counts(batch.id)).toEqual({ envelopes: 2, sent: 2, invites: 4, summaries: 1 });
  });

  it('two workers at once process every row exactly once (skip locked)', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, 'c'));
    const batch = await preview([HEAD, ...rows].join('\n'));
    await confirm(batch.id);
    const [a, b] = await Promise.all([worker().flushOnce(20), worker().flushOnce(20)]);
    expect(a.claimed + b.claimed).toBe(12);
    expect(a.sent + b.sent).toBe(12);
    expect(await counts(batch.id)).toEqual({ envelopes: 12, sent: 12, invites: 24, summaries: 1 });
    const attempts = await q(
      `select max(attempts)::int as m from bulk_batch_rows where batch_id = $1`,
      [batch.id],
    );
    expect(attempts.rows[0]?.m).toBe(1);
  });

  it('honours the per-minute throttle in the claim query', async () => {
    const repo = app.get(BulkRepository);
    const batch = await preview([HEAD, row(1, 'd'), row(2, 'd'), row(3, 'd')].join('\n'));
    await confirm(batch.id);
    // Two hours ahead, so claims from the earlier tests are outside the window.
    const now = new Date(Date.now() + 2 * 3_600_000);
    const window = { windowStart: new Date(now.getTime() - 60_000), maxPerWindow: 2 };
    const stale = new Date(now.getTime() - 600_000);
    const claimed = [
      await repo.claimNextRow(now, stale, window),
      await repo.claimNextRow(now, stale, window),
    ];
    expect(claimed.every((r) => r !== null)).toBe(true);
    // The window holds two claims already, so a third is refused.
    expect(await repo.claimNextRow(now, stale, { ...window, maxPerWindow: 2 })).toBeNull();
    // A later window frees it.
    const later = new Date(now.getTime() + 61_000);
    const third = await repo.claimNextRow(later, stale, {
      windowStart: new Date(later.getTime() - 60_000),
      maxPerWindow: 2,
    });
    expect(third).not.toBeNull();
    // Finish the batch so it does not linger for later tests.
    for (const r of [...claimed, third]) if (r) await repo.markRowFailed(r.id, 'send_failed');
    await repo.finishIfDone(batch.id, later);
  });

  describe('restart idempotency', () => {
    afterEach(() => jest.restoreAllMocks());

    it('a worker killed after sending but before marking the row never double-sends', async () => {
      const batch = await preview([HEAD, row(1, 'e'), row(2, 'e')].join('\n'));
      await confirm(batch.id);
      const repo = app.get(BulkRepository);
      jest.spyOn(repo, 'markRowSent').mockRejectedValueOnce(new Error('process killed'));
      const t0 = new Date();
      await expect(worker().flushOnce(1, () => t0)).rejects.toThrow('process killed');
      const stuck = await q(
        `select id, envelope_id, status from bulk_batch_rows
          where batch_id = $1 and status = 'processing'`,
        [batch.id],
      );
      expect(stuck.rowCount).toBe(1);
      const crashedEnvelope = stuck.rows[0]?.envelope_id as string;
      expect((await counts(batch.id)).sent).toBe(1);

      // After the lock is stale, a restarted worker finishes the batch.
      const later = new Date(t0.getTime() + 11 * 60_000);
      const flush = await worker().flushOnce(10, () => later);
      expect(flush).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
      expect(await counts(batch.id)).toEqual({ envelopes: 2, sent: 2, invites: 4, summaries: 1 });
      const same = await q(`select envelope_id from bulk_batch_rows where id = $1`, [
        stuck.rows[0]?.id,
      ]);
      expect(same.rows[0]?.envelope_id).toBe(crashedEnvelope);
    });

    it('a worker killed with a half-built draft resumes that draft', async () => {
      const batch = await preview([HEAD, row(1, 'f')].join('\n'));
      await confirm(batch.id);
      const repo = app.get(BulkRepository);
      // Fail after the draft, signers and fields exist, and also fail to release the row:
      // the process is gone and the row stays `processing`.
      jest.spyOn(app.get(EnvelopesService), 'send').mockRejectedValueOnce(new Error('boom'));
      jest.spyOn(repo, 'releaseRow').mockRejectedValueOnce(new Error('process killed'));
      const t0 = new Date();
      await expect(worker().flushOnce(1, () => t0)).rejects.toThrow('process killed');
      const draft = await q(
        `select b.envelope_id, e.status,
                (select count(*)::int from envelope_signers s where s.envelope_id = e.id) as signers
           from bulk_batch_rows b join envelopes e on e.id = b.envelope_id
          where b.batch_id = $1`,
        [batch.id],
      );
      expect(draft.rows[0]).toMatchObject({ status: 'draft', signers: 2 });

      const later = new Date(t0.getTime() + 11 * 60_000);
      const flush = await worker().flushOnce(10, () => later);
      expect(flush).toMatchObject({ claimed: 1, sent: 1 });
      const after = await q(
        `select b.envelope_id, b.attempts, e.status,
                (select count(*)::int from envelope_signers s where s.envelope_id = e.id) as signers
           from bulk_batch_rows b join envelopes e on e.id = b.envelope_id
          where b.batch_id = $1`,
        [batch.id],
      );
      expect(after.rows[0]).toMatchObject({
        envelope_id: draft.rows[0]?.envelope_id,
        status: 'awaiting_others',
        signers: 2,
        attempts: 2,
      });
      expect(await counts(batch.id)).toEqual({ envelopes: 1, sent: 1, invites: 2, summaries: 1 });
    });

    it('the summary is queued once even if the notified stamp was lost', async () => {
      const batch = await preview([HEAD, row(1, 'g')].join('\n'));
      await confirm(batch.id);
      await worker().flushOnce(10);
      await q(`update bulk_batches set notified_at = null where id = $1`, [batch.id]);
      await worker().flushOnce(10);
      expect((await counts(batch.id)).summaries).toBe(1);
      const stamped = await q(`select notified_at from bulk_batches where id = $1`, [batch.id]);
      expect(stamped.rows[0]?.notified_at).not.toBeNull();
    });
  });

  it('the down script drops the tables and the kind, keeps other kinds, and up re-applies', async () => {
    const before = await q(`select unnest(enum_range(null::email_kind))::text as label`);
    // The booted app holds pooled connections; the rollback needs exclusive DDL locks.
    await app.close();
    const down = readFileSync(resolve(MIGRATIONS, 'down/0032_bulk_batches_down.sql'), 'utf8');
    await q(down);
    expect((await q(`select to_regclass('public.bulk_batches') as t`)).rows[0]?.t).toBeNull();
    expect((await q(`select to_regclass('public.bulk_batch_rows') as t`)).rows[0]?.t).toBeNull();
    const after = await q(`select unnest(enum_range(null::email_kind))::text as label`);
    expect(after.rows.map((r) => r.label)).toEqual(
      before.rows.map((r) => r.label).filter((l) => l !== 'bulk_complete'),
    );
    await q(down); // idempotent
    await migrate();
    expect((await q(`select to_regclass('public.bulk_batches') as t`)).rows[0]?.t).not.toBeNull();
    const kinds = await q(`select unnest(enum_range(null::email_kind))::text as label`);
    expect(kinds.rows.map((r) => r.label)).toContain('bulk_complete');
  });
});
