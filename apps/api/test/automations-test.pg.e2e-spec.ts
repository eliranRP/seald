import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { HttpException } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { WebhookActionExecutor } from '../src/automations/actions/webhook/webhook.executor';
import { WebhookPgRepository } from '../src/automations/actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from '../src/automations/actions/webhook/webhook-secrets.service';
import { verifySignatureHeader } from '../src/automations/actions/webhook/webhook-signature';
import { startReceiver, type TestReceiver } from '../src/automations/ssrf/__tests__/test-receiver';
import type { ResolvedAddress, WebhookResolver } from '../src/automations/ssrf/webhook-target';
import { AutomationTestRateLimiter } from '../src/automations/test-event/automation-test-rate-limiter';
import { AutomationTestPgRepository } from '../src/automations/test-event/automation-test.repository.pg';
import { AutomationTestService } from '../src/automations/test-event/automation-test.service';
import type { AppEnv } from '../src/config/env.schema';

/**
 * WP-29 A2b against real Postgres: the owner-scoped recipe lookup, the
 * approval rule over `mcp_approvals` (newest `automation_external_destination`
 * row for `automation:<id>` decides), and a test POST that leaves no
 * `automation_runs` / `automation_jobs` row behind.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
// Unique per run: suites from parallel jobs share one Postgres server.
const DB_NAME = `automations_test_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the automations test spec');
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
  AUTOMATION_SECRETS_KEY: '3d'.repeat(32),
} as AppEnv;

const resolver: WebhookResolver = async (hostname): Promise<readonly ResolvedAddress[]> => {
  if (hostname === RECEIVER_HOST) return [{ address: '127.0.0.1', family: 4 }];
  throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
};

describePg('automations test endpoint (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  let repo: AutomationTestPgRepository;
  let secrets: WebhookSecretsService;
  let svc: AutomationTestService;
  let rx: TestReceiver;
  let ownerId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: dedicated.toString(), max: 4 });
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
    repo = new AutomationTestPgRepository(db);
    const webhookRepo = new WebhookPgRepository(db);
    secrets = new WebhookSecretsService(webhookRepo, ENV, ALLOWANCE);
    const executor = new WebhookActionExecutor(secrets, webhookRepo, ENV, resolver, ALLOWANCE);
    svc = new AutomationTestService(repo, secrets, executor, new AutomationTestRateLimiter(), ENV);
    rx = await startReceiver();
  }, 180_000);

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    ownerId = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
    rx.received.length = 0;
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

  async function addRecipe(owner = ownerId, action = 'webhook'): Promise<string> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'sealed_webhook', 'Hook', false, 'envelope_sealed', $2, $3) returning id`,
      [owner, action, JSON.stringify({ payload_detail: 'ids', url_host: RECEIVER_HOST })],
    );
    return res.rows[0]!.id;
  }

  let approvalClock = 0;
  async function addApproval(
    automationId: string,
    state: 'open' | 'approved' | 'denied' | 'expired',
    opts: { owner?: string; action?: string } = {},
  ): Promise<void> {
    approvalClock += 1;
    const created = new Date(Date.UTC(2026, 9, 22, 10, 0, approvalClock)).toISOString();
    await pool!.query(
      `insert into public.mcp_approvals
         (owner_id, api_key_id, action, tool, subject_key, summary, subject_hash, expires_at,
          approved_at, denied_at, expired_at, created_at)
       values ($1, $2, $3, 'automations_upsert_recipe', $4, '{}'::jsonb, $5,
               now() + interval '1 day', $6, $7, $8, $9)`,
      [
        opts.owner ?? ownerId,
        randomUUID(),
        opts.action ?? 'automation_external_destination',
        `automation:${automationId}`,
        'a'.repeat(64),
        state === 'approved' ? created : null,
        state === 'denied' ? created : null,
        state === 'expired' ? created : null,
        created,
      ],
    );
  }

  it('findRecipe is owner scoped', async () => {
    const id = await addRecipe();
    expect(await repo.findRecipe(ownerId, id)).toEqual({
      id,
      ownerId,
      action: 'webhook',
      trigger: 'envelope_sealed',
    });
    expect(await repo.findRecipe(randomUUID(), id)).toBeNull();
    expect(await repo.findRecipe(ownerId, randomUUID())).toBeNull();
  });

  it('approval rule: no row → testable; the newest automation_external_destination row decides', async () => {
    const id = await addRecipe();
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(false);

    await addApproval(id, 'open');
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(true);
    await addApproval(id, 'approved');
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(false);
    await addApproval(id, 'denied');
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(true);
    await addApproval(id, 'approved');
    await addApproval(id, 'expired');
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(true);
  });

  it("another kind's row or another owner's row does not count", async () => {
    const id = await addRecipe();
    await addApproval(id, 'open', { action: 'envelope_send' });
    const stranger = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [stranger]);
    await addApproval(id, 'open', { owner: stranger });
    expect(await repo.recipeAwaitingApproval(ownerId, id)).toBe(false);
  });

  it('end to end: a waiting recipe is refused, an approved one sends one signed test and stores no run', async () => {
    const id = await addRecipe();
    const { secret } = await secrets.createSecrets(
      id,
      `http://${RECEIVER_HOST}:${rx.port}/hooks/seald`,
    );
    await addApproval(id, 'open');

    let refused: unknown;
    try {
      await svc.sendTest(ownerId, id);
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(409);
    expect(rx.received).toHaveLength(0);

    await addApproval(id, 'approved');
    const out = await svc.sendTest(ownerId, id);
    expect(out).toMatchObject({ ok: true, response_status: 200, type: 'automation.test' });
    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(
      verifySignatureHeader({
        header: got.headers['seald-signature'] as string,
        rawBody: got.rawBody,
        secret,
        nowSeconds: Math.floor(Date.now() / 1000),
      }).ok,
    ).toBe(true);
    expect(JSON.parse(got.rawBody)).toMatchObject({ type: 'automation.test', test: true });

    const runs = await pool!.query('select 1 from automation_runs where automation_id = $1', [id]);
    const jobs = await pool!.query('select 1 from automation_jobs where automation_id = $1', [id]);
    expect(runs.rowCount).toBe(0);
    expect(jobs.rowCount).toBe(0);
  });
});
