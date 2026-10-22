import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { WebhookActionExecutor } from '../src/automations/actions/webhook/webhook.executor';
import { WebhookPgRepository } from '../src/automations/actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from '../src/automations/actions/webhook/webhook-secrets.service';
import { verifySignatureHeader } from '../src/automations/actions/webhook/webhook-signature';
import { AutomationWorkerService } from '../src/automations/automation-worker.service';
import { AutomationsPgRepository } from '../src/automations/automations.repository.pg';
import { AutomationMatcherService } from '../src/automations/matcher';
import { startReceiver, type TestReceiver } from '../src/automations/ssrf/__tests__/test-receiver';
import type { ResolvedAddress, WebhookResolver } from '../src/automations/ssrf/webhook-target';
import type { AppEnv } from '../src/config/env.schema';
import { backoffMs } from '../src/email/email-dispatcher.service';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';

/**
 * WP-29 (automations A2) end to end against real Postgres: an envelope
 * event appended through `EnvelopesPgRepository.appendEvent` writes the
 * pending trigger, the matcher (after commit) inserts the run and job, the
 * worker claims the job and the webhook executor delivers a signed POST to
 * a local receiver. Also: a second publish of the same event does not POST
 * twice, retry/permanent outcomes land on the run row as slug + status
 * only, and a loopback destination without the test-only allowance is
 * blocked without a request.
 *
 * The receiver listens on 127.0.0.1, which production blocks. The recipe
 * points at a hostname the stub resolver maps to 127.0.0.1, and the
 * test-only allowance (honoured only under NODE_ENV=test) admits exactly
 * that address, plain HTTP and the ephemeral port.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = 'automations_webhook_ci';
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the automations webhook spec');
}

const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const RECEIVER_HOST = 'hooks.receiver.test';
const ALLOWANCE = { allowHttp: true, allowAnyPort: true, allowAddresses: ['127.0.0.1'] };
const ENV = {
  NODE_ENV: 'test',
  WORKER_ENABLED: false,
  AUTOMATIONS_DISABLED: false,
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  DATABASE_URL: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres',
  CORS_ORIGIN: 'https://seald.nromomentum.com',
  AUTOMATION_SECRETS_KEY: '1e'.repeat(32),
} as AppEnv;

const resolver: WebhookResolver = async (hostname): Promise<readonly ResolvedAddress[]> => {
  if (hostname === RECEIVER_HOST) return [{ address: '127.0.0.1', family: 4 }];
  throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
};

describePg('automations webhook action (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  let repo: AutomationsPgRepository;
  let matcher: AutomationMatcherService;
  let envelopes: EnvelopesPgRepository;
  let secrets: WebhookSecretsService;
  let worker: AutomationWorkerService;
  let rx: TestReceiver;
  let ownerId: string;
  let codeCounter = 0;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: dedicated.toString(), max: 8 });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicated.toString(), MIGRATIONS_DIR },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new AutomationsPgRepository(db);
    matcher = new AutomationMatcherService(repo, ENV);
    envelopes = new EnvelopesPgRepository(db, matcher);
    const webhookRepo = new WebhookPgRepository(db);
    secrets = new WebhookSecretsService(webhookRepo, ENV, ALLOWANCE);
    const executor = new WebhookActionExecutor(secrets, webhookRepo, ENV, resolver, ALLOWANCE);
    worker = new AutomationWorkerService(repo, ENV, { webhook: executor }, secrets);
    rx = await startReceiver();
  }, 180_000);

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    ownerId = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
    rx.received.length = 0;
    rx.setHandler((_r, res) => {
      res.writeHead(200);
      res.end('ok');
    });
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await rx?.close();
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function seedEnvelope(): Promise<{ envelopeId: string; signerId: string }> {
    codeCounter += 1;
    const e = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: `WH${String(codeCounter).padStart(11, '0')}`,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const s = await envelopes.addSigner(e.id, {
      email: 'ada@example.com',
      name: 'Ada',
      color: '#111111',
    });
    return { envelopeId: e.id, signerId: s.id };
  }

  async function addWebhookRecipe(
    url: string,
    trigger = 'envelope_sealed',
    detail: 'ids' | 'with_signer' = 'ids',
  ): Promise<{ id: string; secret: string }> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'sealed_webhook', 'Hook', true, $2, 'webhook', $3) returning id`,
      [ownerId, trigger, JSON.stringify({ payload_detail: detail, url_host: RECEIVER_HOST })],
    );
    const id = res.rows[0]!.id;
    const { secret } = await secrets.createSecrets(id, url);
    return { id, secret };
  }

  async function waitForJob(automationId: string): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      const r = await pool!.query('select 1 from automation_jobs where automation_id = $1', [
        automationId,
      ]);
      if (r.rowCount) return;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    throw new Error('matcher did not enqueue a job');
  }

  async function runRow(automationId: string) {
    const r = await pool!.query<{
      id: string;
      status: string;
      retryable: boolean;
      attempts: number;
      last_error: string | null;
      response_status: number | null;
    }>(
      `select id, status, retryable, attempts, last_error, response_status
         from automation_runs where automation_id = $1 order by created_at`,
      [automationId],
    );
    return r.rows;
  }

  it('envelope event → matcher → worker → one signed webhook POST, and no second POST on a re-publish', async () => {
    const url = `http://${RECEIVER_HOST}:${rx.port}/hooks/seald?tenant=e2e-path-marker`;
    const { id: autoId, secret } = await addWebhookRecipe(url, 'envelope_sealed', 'with_signer');
    const { envelopeId } = await seedEnvelope();

    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await waitForJob(autoId);

    const before = Math.floor(Date.now() / 1000);
    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 1, retrying: 0, failed: 0 });

    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(got.method).toBe('POST');
    expect(got.url).toBe('/hooks/seald?tenant=e2e-path-marker');
    expect(got.headers.host).toBe(`${RECEIVER_HOST}:${rx.port}`);
    const [run] = await runRow(autoId);
    expect(got.headers['seald-event-id']).toBe(run!.id);
    const verdict = verifySignatureHeader({
      header: got.headers['seald-signature'] as string,
      rawBody: got.rawBody,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.timestamp).toBeGreaterThanOrEqual(before);
    const body = JSON.parse(got.rawBody) as {
      version: string;
      id: string;
      type: string;
      created_at: string;
      data: Record<string, unknown>;
    };
    expect(body.version).toBe('seald.automation.v1');
    expect(body.id).toBe(run!.id);
    expect(body.type).toBe('envelope.sealed');
    expect(body.created_at).toBe(new Date(ev.created_at).toISOString());
    expect(body.data).toMatchObject({
      envelope_id: envelopeId,
      title: 'Lease',
      verify_url: expect.stringMatching(/^https:\/\/seald\.nromomentum\.com\/verify\/WH/),
    });
    expect(body.data).not.toHaveProperty('signer');
    expect(got.rawBody).not.toMatch(/token|sign_url|access_token/i);

    expect(run).toMatchObject({
      status: 'done',
      attempts: 1,
      last_error: null,
      response_status: 200,
    });

    // The URL and the secret live only in the encrypted columns.
    const leak = await pool!.query<{ n: string }>(
      `select count(*) n from (
         select config::text t from automations where id = $1
         union all select row_to_json(r)::text from automation_runs r where automation_id = $1
         union all select encode(secret_ciphertext, 'escape') || encode(url_ciphertext, 'escape')
                     from automation_secrets where automation_id = $1
       ) x where t like '%e2e-path-marker%' or t like $2`,
      [autoId, `%${secret}%`],
    );
    expect(Number(leak.rows[0]!.n)).toBe(0);

    // Re-publishing the same event (a second `sealed` for this envelope)
    // dedupes on the run key: no new run, no job, no second POST.
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await matcher.rescan({ full: true });
    expect(await worker.flushOnce(10)).toEqual({ claimed: 0, done: 0, retrying: 0, failed: 0 });
    expect(rx.received).toHaveLength(1);
    expect(await runRow(autoId)).toHaveLength(1);
  });

  it('a 503 retries with the email backoff, then a 404 fails permanently; only slug + status are stored', async () => {
    const { id: autoId } = await addWebhookRecipe(`http://${RECEIVER_HOST}:${rx.port}/in`);
    const { envelopeId } = await seedEnvelope();
    rx.setHandler((_r, res) => {
      res.writeHead(503);
      res.end('upstream body ada@example.com');
    });
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await waitForJob(autoId);

    const t0 = new Date();
    expect(await worker.flushOnce(10, () => t0)).toMatchObject({ claimed: 1, retrying: 1 });
    expect((await runRow(autoId))[0]).toMatchObject({
      status: 'retrying',
      last_error: 'http_503',
      response_status: 503,
      attempts: 1,
    });
    const job = await pool!.query<{ status: string; scheduled_for: Date }>(
      'select status, scheduled_for from automation_jobs where automation_id = $1',
      [autoId],
    );
    expect(job.rows[0]!.status).toBe('pending');
    expect(job.rows[0]!.scheduled_for.getTime()).toBe(t0.getTime() + backoffMs(1));
    // Not due yet.
    expect((await worker.flushOnce(10, () => t0)).claimed).toBe(0);

    rx.setHandler((_r, res) => {
      res.writeHead(404);
      res.end();
    });
    const t1 = new Date(t0.getTime() + backoffMs(1) + 1000);
    expect(await worker.flushOnce(10, () => t1)).toMatchObject({ claimed: 1, failed: 1 });
    expect((await runRow(autoId))[0]).toMatchObject({
      status: 'failed',
      retryable: false,
      last_error: 'http_404',
      response_status: 404,
      attempts: 2,
    });
    const jobs = await pool!.query('select 1 from automation_jobs where automation_id = $1', [
      autoId,
    ]);
    expect(jobs.rowCount).toBe(0);
    expect(rx.received).toHaveLength(2);
  });

  it('a loopback destination is blocked without the test-only allowance, and no request is sent', async () => {
    const { id: autoId } = await addWebhookRecipe(`http://${RECEIVER_HOST}:${rx.port}/in`);
    const webhookRepo = new WebhookPgRepository(db);
    const strictSecrets = new WebhookSecretsService(webhookRepo, ENV);
    const strict = new AutomationWorkerService(
      repo,
      ENV,
      { webhook: new WebhookActionExecutor(strictSecrets, webhookRepo, ENV, resolver) },
      strictSecrets,
    );
    const { envelopeId } = await seedEnvelope();
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await waitForJob(autoId);
    expect(await strict.flushOnce(10)).toMatchObject({ claimed: 1, failed: 1 });
    expect((await runRow(autoId))[0]).toMatchObject({
      status: 'failed',
      retryable: false,
      last_error: 'webhook_url_blocked',
      response_status: null,
    });
    expect(rx.received).toHaveLength(0);
  });

  it('a per-signer `signed` recipe POSTs once per signer event with the signer when chosen', async () => {
    const { id: autoId } = await addWebhookRecipe(
      `http://${RECEIVER_HOST}:${rx.port}/in`,
      'signer_signed',
      'with_signer',
    );
    const { envelopeId, signerId } = await seedEnvelope();
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: 'signed',
    });
    await waitForJob(autoId);
    expect(await worker.flushOnce(10)).toMatchObject({ done: 1 });
    const body = JSON.parse(rx.received[0]!.rawBody) as { type: string; data: unknown };
    expect(body.type).toBe('signer.signed');
    expect(body.data).toMatchObject({
      signer: { id: signerId, name: 'Ada', email: 'ada@example.com' },
    });
  });

  it('rotation stores the previous ciphertext and the daily pass clears it after 24 hours', async () => {
    const { id: autoId } = await addWebhookRecipe(`http://${RECEIVER_HOST}:${rx.port}/in`);
    const now = new Date();
    const { previousRetiresAt } = await secrets.rotateSecret(autoId, now);
    const row = await pool!.query<{ has_prev: boolean }>(
      'select previous_ciphertext is not null as has_prev from automation_secrets where automation_id = $1',
      [autoId],
    );
    expect(row.rows[0]!.has_prev).toBe(true);
    expect((await secrets.decrypt(autoId, now)).previousSecret).not.toBeNull();
    expect(await secrets.clearRetiredPrevious(new Date(previousRetiresAt.getTime() + 1))).toBe(1);
    const after = await pool!.query<{ has_prev: boolean }>(
      'select previous_ciphertext is not null as has_prev from automation_secrets where automation_id = $1',
      [autoId],
    );
    expect(after.rows[0]!.has_prev).toBe(false);
  });
});
