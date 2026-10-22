import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { SealSweepPgRepository } from '../src/sealing/seal-sweep.repository.pg';

/**
 * SealSweepPgRepository against real Postgres (candidate SQL, `skip locked`
 * re-arm, ON CONFLICT insert). Same harness contract as
 * gdrive-token-erasure.pg.e2e-spec.ts: it opens its own database on the
 * server named by SUBMIT_SIGNER_DATABASE_URL, skips when unset locally, and
 * fails in CI when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = 'seal_sweep_ci';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the seal-sweep pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;
const MIN = 60_000;

describePg('SealSweepPgRepository (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let repo: SealSweepPgRepository;
  let ownerId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 8 });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: {
        ...process.env,
        DATABASE_URL: dedicatedUrl,
        MIGRATIONS_DIR: resolve(__dirname, '../db/migrations'),
      },
    });
    repo = new SealSweepPgRepository(
      new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }),
    );
    ownerId = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [ownerId]);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  interface SeedOpts {
    status?: 'sealing' | 'awaiting_others';
    signedAgoMs: number;
    job?: {
      status: 'pending' | 'running' | 'done' | 'failed';
      attempts?: number;
      startedAgoMs?: number;
    };
    signerSigned?: boolean;
  }

  async function seed(opts: SeedOpts): Promise<string> {
    if (!pool) throw new Error('pool missing');
    const id = randomUUID();
    const shortCode = id.replace(/-/g, '').slice(0, 13);
    await pool.query(
      `insert into public.envelopes
         (id, owner_id, title, short_code, status, tc_version, privacy_version, expires_at)
       values ($1, $2, 'T', $3, $4, 'v', 'v', now() + interval '30 days')`,
      [id, ownerId, shortCode, opts.status ?? 'sealing'],
    );
    await pool.query(
      `insert into public.envelope_signers (envelope_id, email, name, color, signed_at)
       values ($1, $2, 'S', '#112233', $3)`,
      [
        id,
        `${shortCode}@example.com`,
        opts.signerSigned === false ? null : new Date(Date.now() - opts.signedAgoMs).toISOString(),
      ],
    );
    await pool.query(
      `insert into public.envelope_events (envelope_id, actor_kind, event_type, created_at)
       values ($1, 'system', 'all_signed', $2)`,
      [id, new Date(Date.now() - opts.signedAgoMs).toISOString()],
    );
    if (opts.job) {
      await pool.query(
        `insert into public.envelope_jobs (envelope_id, kind, status, attempts, started_at)
         values ($1, 'seal', $2, $3, $4)`,
        [
          id,
          opts.job.status,
          opts.job.attempts ?? 1,
          opts.job.startedAgoMs === undefined
            ? null
            : new Date(Date.now() - opts.job.startedAgoMs).toISOString(),
        ],
      );
    }
    return id;
  }

  function window(now = Date.now()) {
    return {
      signedBefore: new Date(now - 15 * MIN),
      signedAfter: new Date(now - 6 * 60 * MIN),
      runningStartedBefore: new Date(now - 15 * MIN),
      limit: 500,
    };
  }

  async function reasonFor(id: string, w = window()): Promise<string | undefined> {
    return (await repo.findCandidates(w)).find((c) => c.envelopeId === id)?.reason;
  }

  it('classifies each stuck case and ignores healthy ones', async () => {
    const noJob = await seed({ signedAgoMs: 20 * MIN });
    const failed = await seed({ signedAgoMs: 20 * MIN, job: { status: 'failed', attempts: 2 } });
    const exhausted = await seed({ signedAgoMs: 20 * MIN, job: { status: 'failed', attempts: 5 } });
    const stale = await seed({
      signedAgoMs: 40 * MIN,
      job: { status: 'running', startedAgoMs: 20 * MIN },
    });
    const fresh = await seed({
      signedAgoMs: 40 * MIN,
      job: { status: 'running', startedAgoMs: 2 * MIN },
    });
    const pending = await seed({ signedAgoMs: 40 * MIN, job: { status: 'pending', attempts: 0 } });
    const tooNew = await seed({ signedAgoMs: 5 * MIN });
    const tooOld = await seed({ signedAgoMs: 7 * 60 * MIN });

    expect(await reasonFor(noJob)).toBe('no_job');
    expect(await reasonFor(failed)).toBe('failed_retryable');
    expect(await reasonFor(exhausted)).toBe('exhausted');
    expect(await reasonFor(stale)).toBe('stale_running');
    for (const id of [fresh, pending, tooNew, tooOld]) {
      expect(await reasonFor(id)).toBeUndefined();
    }

    const w = window();
    const poison = await repo.findCandidates({
      signedBefore: w.signedAfter,
      signedAfter: null,
      runningStartedBefore: w.runningStartedBefore,
      limit: 500,
    });
    expect(poison.map((c) => c.envelopeId)).toContain(tooOld);
  });

  it('creates a missing job exactly once under concurrent sweeps', async () => {
    const id = await seed({ signedAgoMs: 20 * MIN });
    const w = window();
    const cand = (await repo.findCandidates(w)).find((c) => c.envelopeId === id);
    if (!cand) throw new Error('candidate missing');
    const results = await Promise.all([
      repo.requeue(cand, w.runningStartedBefore),
      repo.requeue(cand, w.runningStartedBefore),
      repo.requeue(cand, w.runningStartedBefore),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const jobs = await pool!.query('select status from envelope_jobs where envelope_id = $1', [id]);
    expect(jobs.rows).toEqual([{ status: 'pending' }]);
  });

  it('re-arms a stale running job once, and failed-with-attempts-left jobs', async () => {
    const stale = await seed({
      signedAgoMs: 40 * MIN,
      job: { status: 'running', startedAgoMs: 20 * MIN },
    });
    const failed = await seed({ signedAgoMs: 20 * MIN, job: { status: 'failed', attempts: 2 } });
    const w = window();
    const cands = await repo.findCandidates(w);
    for (const id of [stale, failed]) {
      const cand = cands.find((c) => c.envelopeId === id);
      if (!cand) throw new Error(`candidate missing ${id}`);
      expect(await repo.requeue(cand, w.runningStartedBefore)).toBe(true);
      expect(await repo.requeue(cand, w.runningStartedBefore)).toBe(false);
      const row = await pool!.query<{ status: string; started_at: Date | null }>(
        'select status, started_at from envelope_jobs where envelope_id = $1',
        [id],
      );
      expect(row.rows[0]).toMatchObject({ status: 'pending', started_at: null });
    }
  });

  it('flips a fully signed awaiting_others envelope to sealing when re-queuing', async () => {
    const id = await seed({ status: 'awaiting_others', signedAgoMs: 20 * MIN });
    const unsigned = await seed({
      status: 'awaiting_others',
      signedAgoMs: 20 * MIN,
      signerSigned: false,
    });
    const w = window();
    const cands = await repo.findCandidates(w);
    expect(cands.find((c) => c.envelopeId === unsigned)).toBeUndefined();
    const cand = cands.find((c) => c.envelopeId === id);
    if (!cand) throw new Error('candidate missing');
    expect(await repo.requeue(cand, w.runningStartedBefore)).toBe(true);
    const env = await pool!.query<{ status: string }>(
      'select status from envelopes where id = $1',
      [id],
    );
    expect(env.rows[0]?.status).toBe('sealing');
  });
});
