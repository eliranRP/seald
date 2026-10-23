import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Kysely } from 'kysely';
import { Pool } from 'pg';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import type { ApiKeyScope, FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * Public REST API v1 (WP-35) on real Postgres: send, remind and cancel
 * through the owner-approval path, and `Idempotency-Key` through the same
 * atomic claim MCP uses. A request that fails after it claimed a key
 * leaves no claim; a retry runs the call exactly once; two concurrent
 * sends with one key send once.
 *
 * Its own scratch database on the server named by SUBMIT_SIGNER_DATABASE_URL
 * (migrate.sh runs only against that scratch database); skipped when unset
 * locally, fails in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `public_api_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the public API e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const FLAGS: Partial<Record<FeatureFlag, boolean>> = { publicApi: true, signingOrder: true };

class CapturingSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(msg);
    return { providerId: `prv_${randomUUID()}` };
  }
}

interface Key {
  readonly id: string;
  readonly token: string;
}

describePg('public REST API v1: approval and idempotency (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  const owner = randomUUID();
  const OWNER_EMAIL = 'maya@example.com';
  let fresh = '';
  let pdfBytes: Buffer;
  const keys: Record<'approve' | 'unattended', Key> = {
    approve: { id: '', token: '' },
    unattended: { id: '', token: '' },
  };

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }

  async function insertKey(
    name: string,
    opts: { requireApproval: boolean; allowNew: boolean },
  ): Promise<Key> {
    const k = generateApiKey();
    const scopes: ApiKeyScope[] = ['envelopes:read', 'envelopes:write', 'envelopes:send'];
    const row = await q<{ id: string }>(
      `insert into public.api_keys
         (owner_id, name, prefix, key_hash, scopes, expires_at, require_owner_approval, allow_new_recipients)
       values ($1, $2, $3, $4, $5, now() + interval '30 days', $6, $7) returning id`,
      [owner, name, k.prefix, k.keyHash, scopes, opts.requireApproval, opts.allowNew],
    );
    return { id: row.rows[0]!.id, token: k.token };
  }

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const idem = () => `wp35-pg-key-${String((seq += 1)).padStart(6, '0')}`;

  /** A draft made in the web app: a PDF, one signer, one signature field. */
  async function draft(email: string): Promise<{ id: string; signerId: string }> {
    const env = await http().post('/envelopes').set(bearer(fresh)).send({ title: 'Supplier NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    const up = await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(fresh))
      .attach('file', pdfBytes, { filename: 'nda.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const signer = await http()
      .post(`/envelopes/${id}/signers`)
      .set(bearer(fresh))
      .send({ name: 'Nia', email });
    expect(signer.status).toBe(201);
    const fields = await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(fresh))
      .send({
        fields: [
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
            required: true,
          },
        ],
      });
    expect(fields.status).toBe(200);
    return { id, signerId: signer.body.id as string };
  }

  async function status(id: string): Promise<string> {
    const r = await q<{ status: string }>('select status::text from envelopes where id = $1', [id]);
    return r.rows[0]!.status;
  }

  async function events(id: string) {
    const r = await q<{ event_type: string; metadata: Record<string, unknown> }>(
      `select event_type::text, metadata from envelope_events
        where envelope_id = $1 order by created_at, id`,
      [id],
    );
    return r.rows;
  }

  const sentCount = async (id: string) =>
    (await events(id)).filter((e) => e.event_type === 'sent').length;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4 });
    pool.on('error', () => undefined);
    await q(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key, email text, email_confirmed_at timestamptz
      );
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: MIGRATIONS },
    });
    await q(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [
      owner,
      OWNER_EMAIL,
    ]);
    keys.approve = await insertKey('Key 2', { requireApproval: true, allowNew: false });
    keys.unattended = await insertKey('Unattended', { requireApproval: false, allowNew: true });

    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdfBytes = Buffer.from(await doc.save());

    const tk = await buildTestJwks();
    const nowS = Math.floor(Date.now() / 1000);
    fresh = await tk.sign(
      { sub: owner, email: OWNER_EMAIL, amr: [{ method: 'password', timestamp: nowS - 60 }] },
      { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' },
    );

    const testEnv: AppEnv = {
      NODE_ENV: 'test',
      PORT: 0,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      CORS_ORIGIN: APP_URL,
      APP_PUBLIC_URL: APP_URL,
      DATABASE_URL: `${dedicatedUrl}${dedicatedUrl.includes('?') ? '&' : '?'}sslmode=disable`,
      STORAGE_BUCKET: 'envelopes',
      TC_VERSION: 'tc',
      PRIVACY_VERSION: 'pp',
      EMAIL_PROVIDER: 'logging',
      EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
      EMAIL_FROM_NAME: 'Seald',
      EMAIL_LEGAL_ENTITY: 'Seald',
      EMAIL_LEGAL_POSTAL: 'Postal address',
      EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
      EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
      PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
      WORKER_ENABLED: false,
      GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
      GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
      APPROVAL_CSRF_KEY: 'k'.repeat(48),
      EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
      EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
    };
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(StorageService)
      .useValue(new InMemoryStorageService())
      .overrideProvider(EmailSender)
      .useValue(new CapturingSender())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
  });

  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await app?.get<Kysely<Database>>(DB_TOKEN).destroy();
    await app?.close();
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  describe('approval path (the key asks the owner)', () => {
    it('202 approval_pending, then the owner approves: sent exactly once, replay is the same answer', async () => {
      const d = await draft('nia@new.test');
      const key = idem();
      const res = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send({});
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        status: 'approval_pending',
        approve_requires: 'session',
        review_url: `${APP_URL}/approve/${String(res.body.approval_id)}/review`,
      });
      expect(JSON.stringify(res.body)).not.toContain('/approve#');
      expect(await status(d.id)).toBe('draft');
      expect(await sentCount(d.id)).toBe(0);

      const again = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send({});
      expect(again.status).toBe(202);
      expect(again.body).toEqual(res.body);
      const rows = await q('select id from mcp_approvals where envelope_id = $1', [d.id]);
      expect(rows.rows).toHaveLength(1);

      const polled = await http()
        .get(`/api/v1/approvals/${String(res.body.approval_id)}`)
        .set(bearer(keys.approve.token));
      expect(polled.status).toBe(200);
      expect(polled.body).toEqual({ status: 'pending' });

      const approved = await http()
        .post(`/approvals/${String(res.body.approval_id)}/approve`)
        .set(bearer(fresh));
      expect(approved.status).toBe(200);
      expect(await status(d.id)).toBe('awaiting_others');
      expect(await sentCount(d.id)).toBe(1);

      const after = await http()
        .get(`/api/v1/approvals/${String(res.body.approval_id)}`)
        .set(bearer(keys.approve.token));
      expect(after.body).toEqual({ status: 'done' });
      // The agent retries after done: the stored answer, still one send.
      const retried = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send({});
      expect(retried.body).toEqual(res.body);
      expect(await sentCount(d.id)).toBe(1);

      const sent = (await events(d.id)).find((e) => e.event_type === 'sent');
      expect(sent?.metadata['mcp']).toMatchObject({
        auth: 'api_key',
        key_id: keys.approve.id,
        tool: 'envelopes_send',
        approval: 'email',
      });
    });

    it('remind and cancel also answer 202, and cancel needs a session', async () => {
      const d = await draft('rem@new.test');
      const sent = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.approve.token))
        .send({});
      await http()
        .post(`/approvals/${String(sent.body.approval_id)}/approve`)
        .set(bearer(fresh))
        .expect(200);

      const remind = await http()
        .post(`/api/v1/envelopes/${d.id}/signers/${d.signerId}/remind`)
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', idem())
        .send({});
      // The signer was invited a moment ago: the hourly guard answers first.
      expect([202, 429]).toContain(remind.status);
      if (remind.status === 429) expect(remind.body.error).toBe('remind_throttled');

      const cancel = await http()
        .post(`/api/v1/envelopes/${d.id}/cancel`)
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', idem())
        .send({});
      expect(cancel.status).toBe(202);
      expect(cancel.body).toMatchObject({
        status: 'approval_pending',
        approve_requires: 'session',
      });
      expect(await status(d.id)).toBe('awaiting_others');
    });

    it('two concurrent sends with one Idempotency-Key open one approval', async () => {
      const d = await draft('par@new.test');
      const key = idem();
      const go = () =>
        http()
          .post(`/api/v1/envelopes/${d.id}/send`)
          .set(bearer(keys.approve.token))
          .set('Idempotency-Key', key)
          .send({});
      const [a, b] = await Promise.all([go(), go()]);
      const statuses = [a.status, b.status].sort();
      // One runs (202); the other is the replay (202) or told it is still running (409).
      expect(statuses[0]).toBe(202);
      expect([202, 409]).toContain(statuses[1]);
      const rows = await q('select id from mcp_approvals where envelope_id = $1', [d.id]);
      expect(rows.rows).toHaveLength(1);
    });
  });

  describe('unattended path (the owner turned approval off for this key)', () => {
    it('preview gives a token; send with it runs once; a failed attempt leaves no claim', async () => {
      const d = await draft('una@new.test');
      const preview = await http()
        .post(`/api/v1/envelopes/${d.id}/send/preview`)
        .set(bearer(keys.unattended.token))
        .set('Idempotency-Key', idem())
        .send({});
      expect(preview.status).toBe(200);
      const token = String(preview.body.confirmation_token);
      expect(token).toHaveLength(43);

      // A wrong token fails; the same Idempotency-Key is still free afterwards.
      const key = idem();
      const bad = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.unattended.token))
        .set('Idempotency-Key', key)
        .send({ confirmation_token: 'x'.repeat(43) });
      expect(bad.status).toBe(409);
      expect(bad.body).toEqual({ error: 'confirmation_invalid', message: expect.any(String) });
      expect(await status(d.id)).toBe('draft');
      const claim = await q(`select 1 from idempotency_records where idempotency_key = $1`, [
        `mcp:${keys.unattended.id}:${key}`,
      ]);
      expect(claim.rows).toHaveLength(0);

      const sent = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.unattended.token))
        .set('Idempotency-Key', key)
        .send({ confirmation_token: token });
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ status: 'sent', envelope_id: d.id });
      expect(await status(d.id)).toBe('awaiting_others');
      expect(await sentCount(d.id)).toBe(1);

      // Retry with the same key and request: the stored result, no second send.
      const replay = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.unattended.token))
        .set('Idempotency-Key', key)
        .send({ confirmation_token: token });
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(sent.body);
      expect(await sentCount(d.id)).toBe(1);

      // The same key with a different request is a conflict.
      const clash = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.unattended.token))
        .set('Idempotency-Key', key)
        .send({ confirmation_token: 'y'.repeat(43) });
      expect(clash.status).toBe(409);
      expect(clash.body.error).toBe('idempotency_conflict');
    });

    it('a send without a token is 409 confirmation_required', async () => {
      // A known recipient (sent from the web app before) so the key may act unattended.
      const first = await draft('known@new.test');
      await http().post(`/envelopes/${first.id}/send`).set(bearer(fresh)).expect(201);
      const d = await draft('known@new.test');
      const res = await http()
        .post(`/api/v1/envelopes/${d.id}/send`)
        .set(bearer(keys.unattended.token))
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('confirmation_required');
    });
  });

  describe('idempotency on plain writes', () => {
    it('runs a create once, replays it, and keeps the claim per key', async () => {
      const key = idem();
      const body = { title: 'Once only' };
      const first = await http()
        .post('/api/v1/envelopes')
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send(body);
      const second = await http()
        .post('/api/v1/envelopes')
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      const rows = await q(`select id from envelopes where owner_id = $1 and title = 'Once only'`, [
        owner,
      ]);
      expect(rows.rows).toHaveLength(1);
      const conflict = await http()
        .post('/api/v1/envelopes')
        .set(bearer(keys.approve.token))
        .set('Idempotency-Key', key)
        .send({ title: 'Another title' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe('idempotency_conflict');
    });

    it('the envelope is in the API: owner-scoped list, status and sealed-download refusal', async () => {
      const created = await http()
        .post('/api/v1/envelopes')
        .set(bearer(keys.approve.token))
        .send({ title: 'Listed' });
      const id = created.body.id as string;
      const list = await http()
        .get('/api/v1/envelopes?title=Listed')
        .set(bearer(keys.approve.token));
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).toContain(id);
      const download = await http()
        .get(`/api/v1/envelopes/${id}/download?kind=sealed`)
        .set(bearer(keys.approve.token));
      expect(download.status).toBe(409);
      expect(download.body).toEqual({ error: 'file_not_ready', message: expect.any(String) });
    });
  });

  it('the session routes still refuse the key', async () => {
    const res = await http()
      .post('/envelopes')
      .set(bearer(keys.approve.token))
      .send({ title: 'x' });
    expect(res.status).toBe(401);
  });
});
