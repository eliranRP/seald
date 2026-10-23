import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import {
  AUTO_DISABLE_THRESHOLD,
  AutoDisableService,
  AutoDisableStore,
  PgAutoDisableStore,
} from '../src/automations/auto-disable';
import type {
  AutomationActionOutcome,
  AutomationActionExecutors,
} from '../src/automations/automation-actions';
import { AutomationWorkerService } from '../src/automations/automation-worker.service';
import { AutomationsCrudPgRepository } from '../src/automations/automations-crud.repository.pg';
import { AutomationsPgRepository } from '../src/automations/automations.repository.pg';
import type { AppEnv } from '../src/config/env.schema';

/**
 * A8 auto-disable against real Postgres (migration 0037). Runs real worker
 * `process()` calls on claimed jobs, so the streak is the one `failRun`
 * keeps, and the disable plus its notice go through `PgAutoDisableStore`.
 * Same harness contract as automations.pg.e2e-spec.ts: its own scratch
 * database on the server named by SUBMIT_SIGNER_DATABASE_URL, skipped when
 * unset locally, required in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `automations_disabled_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the auto-disable pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const ENV = {
  WORKER_ENABLED: false,
  AUTOMATIONS_DISABLED: false,
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
} as AppEnv;
const T0 = new Date('2026-10-23T09:00:00.000Z');

describePg('A8 auto-disable (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: AutomationsPgRepository;
  let crud: AutomationsCrudPgRepository;
  let store: AutoDisableStore;
  let service: AutoDisableService;
  let outcome: AutomationActionOutcome;
  let worker: AutomationWorkerService;

  async function migrateScratch(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
  }

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]);
  }

  async function count(sqlText: string, params: unknown[]): Promise<number> {
    const res = await pool!.query<{ n: string }>(sqlText, params);
    return Number(res.rows[0]!.n);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 8 });
    // A forced drop in afterAll can end a client that pool.end() is still closing.
    pool.on('error', () => undefined);
    // The owner's address is read from auth.users, so the stub carries email.
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key, email text);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrateScratch();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new AutomationsPgRepository(db);
    crud = new AutomationsCrudPgRepository(db);
    store = new PgAutoDisableStore(db);
    service = new AutoDisableService(store, ENV);
    const executors = {
      webhook: { execute: async () => outcome },
    } as unknown as AutomationActionExecutors;
    worker = new AutomationWorkerService(repo, ENV, executors, undefined, service);
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    outcome = { kind: 'permanent', slug: 'http_404' };
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function makeOwner(email: string | null): Promise<string> {
    const id = randomUUID();
    await pool!.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    return id;
  }

  async function makeRecipe(ownerId: string, name = 'Save to Drive'): Promise<string> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'sealed_webhook', $2, true, 'envelope_sealed', 'webhook', '{}') returning id`,
      [ownerId, name],
    );
    return res.rows[0]!.id;
  }

  /** Queue one run and its job, then claim it the way the loop does. */
  async function claimOne(ownerId: string, automationId: string) {
    const run = await pool!.query<{ id: string }>(
      `insert into public.automation_runs (automation_id, owner_id, trigger, action)
       values ($1, $2, 'envelope_sealed', 'webhook') returning id`,
      [automationId, ownerId],
    );
    const runId = run.rows[0]!.id;
    // Due a second ago: the database clock and this process's clock differ
    // by sub-millisecond amounts, so a job due "now" can miss the claim.
    await pool!.query(
      'insert into public.automation_jobs (run_id, automation_id, scheduled_for) values ($1, $2, $3)',
      [runId, automationId, new Date(Date.now() - 1000).toISOString()],
    );
    const now = new Date();
    const claimed = await repo.claimNextJob(now, new Date(now.getTime() - 15 * 60_000));
    if (!claimed) throw new Error('no job claimed');
    return claimed;
  }

  /** One run through the worker: claim, run the action, record the outcome. */
  async function runOne(ownerId: string, automationId: string, at: Date = T0) {
    const job = await claimOne(ownerId, automationId);
    return worker.process(job, at);
  }

  async function streakOf(automationId: string): Promise<{ enabled: boolean; n: number }> {
    const res = await pool!.query<{ enabled: boolean; consecutive_failures: number }>(
      'select enabled, consecutive_failures from public.automations where id = $1',
      [automationId],
    );
    const row = res.rows[0]!;
    return { enabled: row.enabled, n: row.consecutive_failures };
  }

  async function outboxFor(automationId: string) {
    const res = await pool!.query<{
      kind: string;
      to_email: string;
      dedupe_key: string;
      payload: Record<string, unknown>;
    }>(
      `select kind::text as kind, to_email, dedupe_key, payload
         from public.outbound_emails
        where kind = 'automation_disabled' and dedupe_key like $1`,
      [`automation_disabled:${automationId}:%`],
    );
    return res.rows;
  }

  it('19 failed runs leave the recipe on with no notice', async () => {
    const owner = await makeOwner('owner-a@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD - 1; i += 1) {
      expect(await runOne(owner, recipe)).toBe('failed');
    }
    expect(await streakOf(recipe)).toEqual({ enabled: true, n: 19 });
    expect(await outboxFor(recipe)).toHaveLength(0);
  });

  it('the 20th failed run turns the recipe off, records why and when, and queues one notice', async () => {
    const owner = await makeOwner('owner-b@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD - 1; i += 1) await runOne(owner, recipe);
    expect(await runOne(owner, recipe)).toBe('failed');

    const row = await pool!.query<{
      enabled: boolean;
      disabled_at: Date | null;
      disabled_reason: string | null;
      consecutive_failures: number;
    }>(
      'select enabled, disabled_at, disabled_reason, consecutive_failures from public.automations where id = $1',
      [recipe],
    );
    expect(row.rows[0]).toMatchObject({
      enabled: false,
      disabled_reason: 'consecutive_failures',
      consecutive_failures: 20,
    });
    expect(row.rows[0]!.disabled_at?.toISOString()).toBe(T0.toISOString());

    const mail = await outboxFor(recipe);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.to_email).toBe('owner-b@example.com');
    expect(mail[0]!.dedupe_key).toBe(`automation_disabled:${recipe}:${T0.toISOString()}`);
    expect(mail[0]!.payload).toMatchObject({
      automation_name: 'Save to Drive',
      failure_count: 20,
      settings_url: 'https://seald.nromomentum.com/settings/automations',
    });
    expect(JSON.stringify(mail[0]!.payload)).not.toMatch(/token|\?t=/i);
  });

  it('a failure after the disable, and a second flip attempt, add no second notice', async () => {
    const owner = await makeOwner('owner-c@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD; i += 1) await runOne(owner, recipe);
    await runOne(owner, recipe);
    expect(await service.afterFailure(recipe, T0)).toBe(false);
    expect(await outboxFor(recipe)).toHaveLength(1);
    expect((await streakOf(recipe)).enabled).toBe(false);
  });

  it('two racing checks on the same recipe flip it once and queue one notice', async () => {
    const owner = await makeOwner('owner-d@example.com');
    const recipe = await makeRecipe(owner);
    // Stop just short of the threshold without the check running, then race two checks.
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD; i += 1) {
      await pool!.query(
        'update public.automations set consecutive_failures = consecutive_failures + 1 where id = $1',
        [recipe],
      );
    }
    const results = await Promise.all([
      service.afterFailure(recipe, T0),
      service.afterFailure(recipe, T0),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await outboxFor(recipe)).toHaveLength(1);
  });

  it('a success resets the streak, so the count starts again from zero', async () => {
    const owner = await makeOwner('owner-e@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < 15; i += 1) await runOne(owner, recipe);
    outcome = { kind: 'done', responseStatus: 200 };
    expect(await runOne(owner, recipe)).toBe('done');
    expect(await streakOf(recipe)).toEqual({ enabled: true, n: 0 });

    outcome = { kind: 'permanent', slug: 'http_404' };
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD - 1; i += 1) await runOne(owner, recipe);
    expect(await streakOf(recipe)).toEqual({ enabled: true, n: 19 });
    expect(await outboxFor(recipe)).toHaveLength(0);
  });

  it('re-enabling resets the streak and clears the disable record', async () => {
    const owner = await makeOwner('owner-f@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD; i += 1) await runOne(owner, recipe);
    expect((await streakOf(recipe)).enabled).toBe(false);

    await crud.update(owner, recipe, { enabled: true });
    const after = await pool!.query<{ disabled_at: Date | null; disabled_reason: string | null }>(
      'select disabled_at, disabled_reason from public.automations where id = $1',
      [recipe],
    );
    expect(after.rows[0]).toEqual({ disabled_at: null, disabled_reason: null });
    expect(await streakOf(recipe)).toEqual({ enabled: true, n: 0 });

    for (let i = 0; i < AUTO_DISABLE_THRESHOLD - 1; i += 1) await runOne(owner, recipe);
    expect((await streakOf(recipe)).enabled).toBe(true);
  });

  it('an owner with no address is still turned off, with no notice row', async () => {
    const owner = await makeOwner(null);
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD; i += 1) await runOne(owner, recipe);
    expect((await streakOf(recipe)).enabled).toBe(false);
    expect(await outboxFor(recipe)).toHaveLength(0);
  });

  it('one notice row per recipe and disable time', async () => {
    const owner = await makeOwner('owner-g@example.com');
    const recipe = await makeRecipe(owner);
    for (let i = 0; i < AUTO_DISABLE_THRESHOLD; i += 1) await runOne(owner, recipe);
    const total = await count(
      "select count(*)::text as n from public.outbound_emails where kind = 'automation_disabled' and dedupe_key = $1",
      [`automation_disabled:${recipe}:${T0.toISOString()}`],
    );
    expect(total).toBe(1);
  });

  describe('migration 0037 rollback and re-apply', () => {
    it('the down script removes the columns and the enum label, and the runner re-applies the up', async () => {
      await psqlFile(resolve(MIGRATIONS_DIR, 'down/0037_automation_disabled_down.sql'));
      expect(
        await count(
          `select count(*)::text as n from information_schema.columns
            where table_schema = 'public' and table_name = 'automations'
              and column_name in ('disabled_at', 'disabled_reason')`,
          [],
        ),
      ).toBe(0);
      expect(
        await count(
          `select count(*)::text as n from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = 'email_kind' and e.enumlabel = 'automation_disabled'`,
          [],
        ),
      ).toBe(0);

      await migrateScratch();
      expect(
        await count(
          `select count(*)::text as n from information_schema.columns
            where table_schema = 'public' and table_name = 'automations'
              and column_name in ('disabled_at', 'disabled_reason')`,
          [],
        ),
      ).toBe(2);
      expect(
        await count(
          `select count(*)::text as n from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = 'email_kind' and e.enumlabel = 'automation_disabled'`,
          [],
        ),
      ).toBe(1);
    });
  });
});
