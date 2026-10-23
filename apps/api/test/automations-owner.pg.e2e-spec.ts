import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Kysely } from 'kysely';
import { Pool } from 'pg';
import request from 'supertest';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
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
 * Owner routes for automations (WP-31) on real Postgres, through the HTTP
 * surface with a session JWT: flag off is 404, owner isolation, the webhook
 * secret in the create and rotate responses only, a signed-in save settling
 * an agent's open, denied or expired approval so `POST /automations/:id/test`
 * and `awaiting_approval` agree, run history and Retry, and the public stop
 * route still answering without a session.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI when
 * unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `automations_wp31_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';
const HOOK_URL = 'https://hooks.example.com/seald/inbound?token=zzz';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the automations owner e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const ON: Partial<Record<FeatureFlag, boolean>> = { mcpServer: true, workflowAutomations: true };

class CapturingSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(msg);
    return { providerId: `prv_${this.sent.length}` };
  }
}

describePg('automations owner routes (WP-31, e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let authA: { Authorization: string };
  let authB: { Authorization: string };
  const ownerA = randomUUID();
  const ownerB = randomUUID();

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }
  const http = () => request(app.getHttpServer());

  async function createHook(auth = authA): Promise<{ id: string; secret: string }> {
    const res = await http()
      .post('/automations')
      .set(auth)
      .send({ recipe: 'sealed_webhook', url: HOOK_URL });
    expect(res.status).toBe(201);
    const body = res.body as { automation: { id: string }; secret: string };
    return { id: body.automation.id, secret: body.secret };
  }

  /** An agent's approval row for a recipe, as WP-30 leaves it. */
  async function seedApproval(
    owner: string,
    automationId: string,
    state: 'open' | 'denied' | 'expired',
  ): Promise<string> {
    const row = await q<{ id: string }>(
      `insert into public.mcp_approvals
         (owner_id, api_key_id, action, tool, subject_key, args, summary, subject_hash,
          expires_at, denied_at, expired_at, expired_reason)
       values ($1, $2, 'automation_external_destination', 'automations_upsert_recipe', $3,
               '{}'::jsonb, '{}'::jsonb, $4,
               now() + interval '1 day',
               case when $5 = 'denied' then now() end,
               case when $5 = 'expired' then now() end,
               case when $5 = 'expired' then 'ttl' end)
       returning id`,
      [owner, randomUUID(), `automation:${automationId}`, 'a'.repeat(64), state],
    );
    return row.rows[0]!.id;
  }

  async function seedRun(
    automationId: string,
    owner: string,
    over: { retryable?: boolean; last_error?: string } = {},
  ): Promise<string> {
    const row = await q<{ id: string }>(
      `insert into public.automation_runs
         (automation_id, owner_id, trigger, action, status, retryable, attempts, last_error, response_status, finished_at)
       values ($1, $2, 'envelope_sealed', 'webhook', 'failed', $3, 8, $4, 503, now())
       returning id`,
      [automationId, owner, over.retryable ?? true, over.last_error ?? 'attempts_exhausted'],
    );
    return row.rows[0]!.id;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'wp31-e2e-admin' });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4, application_name: 'wp31-e2e' });
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
    await q(
      `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, now())`,
      [ownerA, 'maya@example.com', ownerB, 'bea@example.com'],
    );

    const tk = await buildTestJwks();
    const sign = (sub: string, email: string) =>
      tk.sign(
        { sub, email },
        { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' },
      );
    authA = { Authorization: `Bearer ${await sign(ownerA, 'maya@example.com')}` };
    authB = { Authorization: `Bearer ${await sign(ownerB, 'bea@example.com')}` };

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
      AUTOMATION_SECRETS_KEY: '1'.repeat(64),
      EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
      EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
    };
    host.__SEALD_FEATURE_OVERRIDES__ = ON;
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

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = ON;
    await q(`delete from public.mcp_approvals`);
    await q(`delete from public.automations`);
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

  it('flag off: every route is 404 for any id and body', async () => {
    const { id } = await createHook();
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, workflowAutomations: false };
    const calls = [
      () => http().get('/automations'),
      () => http().post('/automations').send({}),
      () => http().get(`/automations/${id}`),
      () => http().get('/automations/not-a-uuid'),
      () => http().patch(`/automations/${id}`).send({ nope: 1 }),
      () => http().delete(`/automations/${id}`),
      () => http().post(`/automations/${id}/rotate-secret`),
      () => http().get(`/automations/${id}/runs`),
      () => http().get(`/automations/runs/${id}`),
      () => http().post(`/automations/${id}/runs/${id}/retry`),
    ];
    for (const c of calls) expect((await c().set(authA)).status).toBe(404);
  });

  it('needs an owner session', async () => {
    expect((await http().get('/automations')).status).toBe(401);
    expect((await http().post('/automations').send({ recipe: 'sealed_webhook' })).status).toBe(401);
  });

  it('keeps the public stop route reachable without a session', async () => {
    const res = await http().get('/automations/stop');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('creates a webhook on at once with the secret shown once, and never lists it or the address', async () => {
    const created = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'sealed_webhook', url: HOOK_URL, name: 'My hook' });
    expect(created.status).toBe(201);
    const body = created.body as { automation: Record<string, unknown>; secret: string };
    expect(body.secret).toMatch(/^seald_webhook_/);
    expect(body.automation).toMatchObject({
      name: 'My hook',
      enabled: true,
      awaiting_approval: false,
      secret_set: true,
      destination_host: 'hooks.example.com',
      last_run: null,
    });
    const id = body.automation['id'] as string;
    const approvals = await q(`select 1 from mcp_approvals where owner_id = $1`, [ownerA]);
    expect(approvals.rowCount).toBe(0);

    const reads = [
      await http().get('/automations').set(authA),
      await http().get(`/automations/${id}`).set(authA),
    ];
    for (const r of reads) {
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.body);
      expect(text).not.toContain(body.secret);
      expect(text).not.toContain('token=zzz');
      expect(text).not.toContain('/seald/inbound');
    }
    const stored = await q<{ ciphertext: string }>(
      `select encode(secret_ciphertext, 'escape') as ciphertext from automation_secrets where automation_id = $1`,
      [id],
    );
    expect(stored.rows[0]?.ciphertext).not.toContain(body.secret);
  });

  it('rejects a bad body (400) and a private address', async () => {
    const bad = await http().post('/automations').set(authA).send({ recipe: 'nope' });
    expect(bad.status).toBe(400);
    const extra = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'sealed_webhook', url: HOOK_URL, enabled: false });
    expect(extra.status).toBe(400);
    const blocked = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'sealed_webhook', url: 'https://127.0.0.1/hook' });
    expect(blocked.status).toBe(400);
    expect((await http().get('/automations').set(authA)).body).toMatchObject({ items: [] });
  });

  it('creates the Drive recipe and an own-mailbox email recipe, no secret', async () => {
    const drive = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'sealed_save_drive' });
    expect(drive.status).toBe(201);
    expect(drive.body).toMatchObject({ automation: { enabled: true, secret_set: false } });
    expect((drive.body as { secret?: string }).secret).toBeUndefined();
    const mail = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'declined_notify_me' });
    expect(mail.status).toBe(201);
  });

  it('PATCH switches a recipe off and on, renames it, and DELETE removes it', async () => {
    const { id } = await createHook();
    const off = await http().patch(`/automations/${id}`).set(authA).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ automation: { enabled: false, status_word: 'Off' } });
    const on = await http()
      .patch(`/automations/${id}`)
      .set(authA)
      .send({ enabled: true, name: 'Renamed' });
    expect(on.body).toMatchObject({ automation: { enabled: true, name: 'Renamed' } });
    expect((await http().patch(`/automations/${id}`).set(authA).send({})).status).toBe(400);
    expect((await http().delete(`/automations/${id}`).set(authA)).status).toBe(204);
    expect((await http().get(`/automations/${id}`).set(authA)).status).toBe(404);
  });

  it('rotates the secret: new value once, the old one is kept for 24 hours', async () => {
    const { id, secret } = await createHook();
    const res = await http().post(`/automations/${id}/rotate-secret`).set(authA);
    expect(res.status).toBe(200);
    const body = res.body as { secret: string; previous_retires_at: string };
    expect(body.secret).toMatch(/^seald_webhook_/);
    expect(body.secret).not.toBe(secret);
    const hours = (Date.parse(body.previous_retires_at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    const prev = await q<{ has_prev: boolean }>(
      `select previous_ciphertext is not null as has_prev from automation_secrets where automation_id = $1`,
      [id],
    );
    expect(prev.rows[0]?.has_prev).toBe(true);
    expect(JSON.stringify((await http().get(`/automations/${id}`).set(authA)).body)).not.toContain(
      body.secret,
    );
    const drive = await http()
      .post('/automations')
      .set(authA)
      .send({ recipe: 'sealed_save_drive' });
    const driveId = (drive.body as { automation: { id: string } }).automation.id;
    expect((await http().post(`/automations/${driveId}/rotate-secret`).set(authA)).status).toBe(
      409,
    );
  });

  it('owner isolation: another owner gets 404 everywhere and an empty list', async () => {
    const { id } = await createHook();
    const runId = await seedRun(id, ownerA);
    expect((await http().get('/automations').set(authB)).body).toMatchObject({ items: [] });
    const calls = [
      () => http().get(`/automations/${id}`),
      () => http().patch(`/automations/${id}`).send({ name: 'x' }),
      () => http().delete(`/automations/${id}`),
      () => http().post(`/automations/${id}/rotate-secret`),
      () => http().post(`/automations/${id}/test`),
      () => http().get(`/automations/${id}/runs`),
      () => http().get(`/automations/runs/${runId}`),
      () => http().post(`/automations/${id}/runs/${runId}/retry`),
    ];
    for (const c of calls) expect((await c().set(authB)).status).toBe(404);
    expect((await http().get(`/automations/${id}`).set(authA)).status).toBe(200);
  });

  it.each(['open', 'denied', 'expired'] as const)(
    'a signed-in save settles an agent approval that is %s: test and awaiting_approval agree',
    async (state) => {
      const { id } = await createHook();
      await q(`update automations set enabled = false where id = $1`, [id]);
      const approvalId = await seedApproval(ownerA, id, state);

      const blocked = await http().post(`/automations/${id}/test`).set(authA);
      expect(blocked.status).toBe(409);
      expect(blocked.body).toMatchObject({ error: 'recipe_not_approved' });
      const shown = await http().get(`/automations/${id}`).set(authA);
      expect(shown.body).toMatchObject({ awaiting_approval: true, enabled: false });

      const saved = await http().patch(`/automations/${id}`).set(authA).send({ enabled: true });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ automation: { enabled: true, awaiting_approval: false } });

      const after = await http().post(`/automations/${id}/test`).set(authA);
      expect(after.status).toBe(200);
      expect(after.body).toHaveProperty('type', 'automation.test');

      // History stays: the row is settled, not deleted.
      const row = await q<{ expired_reason: string | null; approved_at: string | null }>(
        `select expired_reason, approved_at from mcp_approvals where id = $1`,
        [approvalId],
      );
      expect(row.rows[0]).toEqual({
        expired_reason: 'superseded_by_owner_save',
        approved_at: null,
      });
    },
  );

  it('a newer agent approval after an owner save blocks the recipe again', async () => {
    const { id } = await createHook();
    await seedApproval(ownerA, id, 'open');
    await http().patch(`/automations/${id}`).set(authA).send({ name: 'Saved' });
    expect((await http().get(`/automations/${id}`).set(authA)).body).toMatchObject({
      awaiting_approval: false,
    });
    await seedApproval(ownerA, id, 'open');
    expect((await http().get(`/automations/${id}`).set(authA)).body).toMatchObject({
      awaiting_approval: true,
    });
    expect((await http().post(`/automations/${id}/test`).set(authA)).status).toBe(409);
  });

  it('lists run history newest first and Retry keeps the run id; a permanent failure is refused', async () => {
    const { id } = await createHook();
    const retryable = await seedRun(id, ownerA);
    const permanent = await seedRun(id, ownerA, { retryable: false, last_error: 'http_404' });

    const list = await http().get(`/automations/${id}`).set(authA);
    expect(list.body).toMatchObject({ last_run: { status: 'failed', status_word: 'Failed' } });

    const runs = await http().get(`/automations/${id}/runs`).set(authA);
    expect(runs.status).toBe(200);
    const items = (runs.body as { items: Array<{ id: string; retry_allowed: boolean }> }).items;
    expect(items.map((r) => r.id)).toEqual([permanent, retryable]);
    expect(items.map((r) => r.retry_allowed)).toEqual([false, true]);

    const one = await http().get(`/automations/runs/${permanent}`).set(authA);
    expect(one.body).toMatchObject({
      id: permanent,
      failure_slug: 'http_404',
      failure_message: expect.stringContaining('404') as string,
    });

    const refused = await http().post(`/automations/${id}/runs/${permanent}/retry`).set(authA);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'retry_not_allowed' });

    const retried = await http().post(`/automations/${id}/runs/${retryable}/retry`).set(authA);
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ status: 'queued', run: { id: retryable } });
    const again = await http().post(`/automations/${id}/runs/${retryable}/retry`).set(authA);
    expect(again.body).toMatchObject({ status: 'already_queued' });
    const jobs = await q(`select 1 from automation_jobs where run_id = $1`, [retryable]);
    expect(jobs.rowCount).toBe(1);
  });

  it('paginates run history with a cursor', async () => {
    const { id } = await createHook();
    for (let i = 0; i < 3; i += 1) await seedRun(id, ownerA);
    const first = await http().get(`/automations/${id}/runs?limit=2`).set(authA);
    const body = first.body as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeTruthy();
    const second = await http()
      .get(`/automations/${id}/runs?limit=2&cursor=${encodeURIComponent(body.next_cursor ?? '')}`)
      .set(authA);
    expect((second.body as { items: unknown[] }).items).toHaveLength(1);
    expect((await http().get(`/automations/${id}/runs?limit=0`).set(authA)).status).toBe(400);
  });
});
