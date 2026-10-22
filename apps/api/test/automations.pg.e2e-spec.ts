import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import type { AutomationHookEvent } from '../src/automations/automation-event-hook';
import { AutomationsPgRepository } from '../src/automations/automations.repository.pg';
import { AutomationMatcherService } from '../src/automations/matcher';
import type { AppEnv } from '../src/config/env.schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';

/**
 * Workflow automations A1 against real Postgres: migration 0031 (apply,
 * re-apply, down, up again), the pending trigger written inside
 * appendEvent, matching after commit and on rescan, the run dedupe index,
 * the `for update skip locked` job claim, and account-deletion cascades.
 * Same harness contract as seal-sweep.pg.e2e-spec.ts: its own database on
 * the server named by SUBMIT_SIGNER_DATABASE_URL, skipped when unset
 * locally, required in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = 'automations_ci';
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the automations pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const ENV = { WORKER_ENABLED: false, AUTOMATIONS_DISABLED: false } as AppEnv;

class NoAfterCommitMatcher extends AutomationMatcherService {
  override afterCommit(_event: AutomationHookEvent): void {}
}

describePg('workflow automations A1 (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: AutomationsPgRepository;
  let ownerId: string;
  let codeCounter = 0;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', file]);
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
    // `drop database … with (force)` in afterAll can terminate a client
    // that pool.end() is still closing; that 57P01 is expected teardown.
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new AutomationsPgRepository(db);
  }, 180_000);

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    ownerId = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
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

  function envelopesRepo(matcher: AutomationMatcherService): EnvelopesPgRepository {
    return new EnvelopesPgRepository(db, matcher);
  }

  async function seedEnvelope(
    envelopes: EnvelopesPgRepository,
  ): Promise<{ envelopeId: string; signerIds: string[] }> {
    codeCounter += 1;
    const e = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: `AP${String(codeCounter).padStart(11, '0')}`,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const a = await envelopes.addSigner(e.id, {
      email: 'a@example.com',
      name: 'A',
      color: '#111111',
    });
    const b = await envelopes.addSigner(e.id, {
      email: 'b@example.com',
      name: 'B',
      color: '#222222',
    });
    return { envelopeId: e.id, signerIds: [a.id, b.id] };
  }

  async function addRecipe(trigger: string, action: string, enabled = true): Promise<string> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'r', 'r', $2, $3, $4, '{}') returning id`,
      [ownerId, enabled, trigger, action],
    );
    return res.rows[0]!.id;
  }

  async function count(sqlText: string, params: unknown[]): Promise<number> {
    const res = await pool!.query<{ n: string }>(sqlText, params);
    return Number(res.rows[0]!.n);
  }

  it('0031 enables RLS on every automation table and re-applies cleanly', async () => {
    const res = await pool!.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r'
          and relname like 'automation%' order by relname`,
    );
    expect(res.rows).toEqual(
      [
        'automation_jobs',
        'automation_matcher_checkpoint',
        'automation_runs',
        'automation_secrets',
        'automation_triggers',
        'automations',
      ].map((relname) => ({ relname, relrowsecurity: true })),
    );
    await expect(
      psqlFile(resolve(MIGRATIONS_DIR, '0031_automations.sql')),
    ).resolves.toBeUndefined();
  });

  it('when the matcher throws, the event commits, the trigger stays pending, and the rescan inserts the run', async () => {
    const matcher = new AutomationMatcherService(repo, ENV);
    const spy = jest.spyOn(matcher, 'matchEvent');
    const envelopes = envelopesRepo(matcher);
    const { envelopeId, signerIds } = await seedEnvelope(envelopes);
    const auto = await addRecipe('signer_signed', 'email_copy');
    jest.spyOn(repo, 'matchTrigger').mockRejectedValueOnce(new Error('matcher bug'));

    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      signer_id: signerIds[0]!,
      actor_kind: 'signer',
      event_type: 'signed',
    });
    await expect(spy.mock.results[0]!.value).resolves.toBeNull();
    jest.restoreAllMocks();

    expect(await count('select count(*) n from envelope_events where id = $1', [ev.id])).toBe(1);
    expect(
      await count(
        `select count(*) n from automation_triggers where event_id = $1 and status = 'pending'`,
        [ev.id],
      ),
    ).toBe(1);
    expect(
      await count('select count(*) n from automation_runs where automation_id = $1', [auto]),
    ).toBe(0);

    const result = await matcher.rescan({ full: true });
    expect(result.failed).toBe(0);
    const runs = await pool!.query(
      'select id, event_id, signer_id, status from automation_runs where automation_id = $1',
      [auto],
    );
    expect(runs.rows).toEqual([
      expect.objectContaining({ event_id: ev.id, signer_id: signerIds[0], status: 'queued' }),
    ]);
    expect(
      await count('select count(*) n from automation_jobs where run_id = $1', [runs.rows[0].id]),
    ).toBe(1);
    expect(
      await count('select count(*) n from automation_triggers where event_id = $1', [ev.id]),
    ).toBe(0);
  });

  it('a crash after commit leaves the trigger; two signers make two runs, a duplicate one', async () => {
    const matcher = new NoAfterCommitMatcher(repo, ENV);
    const envelopes = envelopesRepo(matcher);
    const { envelopeId, signerIds } = await seedEnvelope(envelopes);
    const auto = await addRecipe('signer_signed', 'email_copy');
    await addRecipe('signer_signed', 'email_copy', false);

    const ids: string[] = [];
    for (const signerId of [signerIds[0]!, signerIds[1]!, signerIds[0]!]) {
      const ev = await envelopes.appendEvent({
        envelope_id: envelopeId,
        signer_id: signerId,
        actor_kind: 'signer',
        event_type: 'signed',
      });
      ids.push(ev.id);
    }
    expect(
      await count(
        `select count(*) n from automation_triggers where event_id = any($1) and status = 'pending'`,
        [ids],
      ),
    ).toBe(3);
    expect(
      await count('select count(*) n from automation_runs where automation_id = $1', [auto]),
    ).toBe(0);

    // Concurrent matches of the same events race on the dedupe index only.
    await Promise.all(ids.flatMap((id) => [repo.matchTrigger(id), repo.matchTrigger(id)]));
    expect(
      await count('select count(*) n from automation_runs where automation_id = $1', [auto]),
    ).toBe(2);
    expect(
      await count('select count(*) n from automation_jobs where automation_id = $1', [auto]),
    ).toBe(2);
    expect(
      await count('select count(*) n from automation_triggers where event_id = any($1)', [ids]),
    ).toBe(0);
  });

  it('claim skips a row another transaction holds, ignores future rows, and reclaims a stale lock', async () => {
    const matcher = new NoAfterCommitMatcher(repo, ENV);
    const envelopes = envelopesRepo(matcher);
    const { envelopeId } = await seedEnvelope(envelopes);
    const auto = await addRecipe('envelope_sealed', 'webhook');
    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await repo.matchTrigger(ev.id);
    const jobRow = await pool!.query<{ id: string; run_id: string }>(
      'select id, run_id from automation_jobs where automation_id = $1',
      [auto],
    );
    const { id: jobId, run_id: runId } = jobRow.rows[0]!;
    // Keep other tests' jobs out of the way.
    await pool!.query(
      `update automation_jobs set scheduled_for = now() + interval '1 day' where automation_id <> $1`,
      [auto],
    );

    // Future scheduled_for is not claimed.
    await pool!.query(
      `update automation_jobs set scheduled_for = now() + interval '1 hour' where id = $1`,
      [jobId],
    );
    const now = new Date();
    const stale = new Date(now.getTime() - 15 * 60_000);
    expect(await repo.claimNextJob(now, stale)).toBeNull();
    await pool!.query(
      `update automation_jobs set scheduled_for = now() - interval '1 second' where id = $1`,
      [jobId],
    );

    // A row locked by another transaction is skipped.
    const holder = await pool!.connect();
    try {
      await holder.query('begin');
      await holder.query('select id from automation_jobs where id = $1 for update', [jobId]);
      expect(await repo.claimNextJob(new Date(), stale)).toBeNull();
      await holder.query('rollback');
    } finally {
      holder.release();
    }

    // Two concurrent claims: exactly one wins.
    const [a, b] = await Promise.all([
      repo.claimNextJob(new Date(), stale),
      repo.claimNextJob(new Date(), stale),
    ]);
    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({
      job_id: jobId,
      run_id: runId,
      attempts: 1,
      action: 'webhook',
      envelope_id: envelopeId,
    });
    const run = await pool!.query('select status, attempts from automation_runs where id = $1', [
      runId,
    ]);
    expect(run.rows[0]).toEqual({ status: 'running', attempts: 1 });

    // A fresh `running` lock is not reclaimed; one older than 15 minutes is.
    expect(await repo.claimNextJob(new Date(), new Date(Date.now() - 15 * 60_000))).toBeNull();
    await pool!.query(
      `update automation_jobs set locked_at = now() - interval '16 minutes' where id = $1`,
      [jobId],
    );
    const reclaimed = await repo.claimNextJob(new Date(), new Date(Date.now() - 15 * 60_000));
    expect(reclaimed).toMatchObject({ job_id: jobId, attempts: 2 });

    // Retry puts it back to pending with a schedule; failRun deletes it and bumps the streak.
    await repo.retryRun({
      job_id: jobId,
      run_id: runId,
      automation_id: auto,
      slug: 'http_503',
      scheduled_for: new Date(Date.now() + 120_000),
    });
    const retried = await pool!.query(
      'select j.status as job_status, r.status as run_status, r.last_error from automation_jobs j join automation_runs r on r.id = j.run_id where j.id = $1',
      [jobId],
    );
    expect(retried.rows[0]).toEqual({
      job_status: 'pending',
      run_status: 'retrying',
      last_error: 'http_503',
    });
    await repo.failRun({
      job_id: jobId,
      run_id: runId,
      automation_id: auto,
      slug: 'http_404',
      retryable: false,
    });
    expect(await count('select count(*) n from automation_jobs where id = $1', [jobId])).toBe(0);
    const failed = await pool!.query(
      'select r.status, r.retryable, a.consecutive_failures from automation_runs r join automations a on a.id = r.automation_id where r.id = $1',
      [runId],
    );
    expect(failed.rows[0]).toEqual({ status: 'failed', retryable: false, consecutive_failures: 1 });
  });

  it('account deletion removes recipes, secrets, jobs and runs', async () => {
    const matcher = new NoAfterCommitMatcher(repo, ENV);
    const envelopes = envelopesRepo(matcher);
    const { envelopeId } = await seedEnvelope(envelopes);
    const auto = await addRecipe('envelope_sealed', 'webhook');
    await pool!.query(
      `insert into automation_secrets (automation_id, secret_ciphertext, secret_nonce, url_ciphertext, url_nonce)
       values ($1, '\\x01', '\\x02', '\\x03', '\\x04')`,
      [auto],
    );
    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await repo.matchTrigger(ev.id);
    // Envelopes survive account deletion as preserved records (0012).
    await pool!.query('update envelopes set owner_id = null where owner_id = $1', [ownerId]);
    await pool!.query('delete from auth.users where id = $1', [ownerId]);
    expect(await count('select count(*) n from automations where id = $1', [auto])).toBe(0);
    expect(
      await count('select count(*) n from automation_runs where automation_id = $1', [auto]),
    ).toBe(0);
    expect(
      await count('select count(*) n from automation_jobs where automation_id = $1', [auto]),
    ).toBe(0);
    expect(
      await count('select count(*) n from automation_secrets where automation_id = $1', [auto]),
    ).toBe(0);
  });

  it('down script removes the model and the up script re-creates it', async () => {
    await psqlFile(resolve(MIGRATIONS_DIR, 'down/0031_automations_down.sql'));
    const after = await pool!.query(
      `select count(*)::int n from pg_class where relnamespace = 'public'::regnamespace and relname like 'automation%' and relkind = 'r'`,
    );
    expect(after.rows[0]).toEqual({ n: 0 });
    const col = await pool!.query(
      `select count(*)::int n from information_schema.columns where table_name = 'envelopes' and column_name = 'source_template_id'`,
    );
    expect(col.rows[0]).toEqual({ n: 0 });
    await psqlFile(resolve(MIGRATIONS_DIR, '0031_automations.sql'));
    const again = await pool!.query(
      `select count(*)::int n from pg_class where relnamespace = 'public'::regnamespace and relname like 'automation%' and relkind = 'r'`,
    );
    expect(again.rows[0]).toEqual({ n: 6 });
  });
});
