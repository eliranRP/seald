import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { SealSweepPgRepository } from '../src/sealing/seal-sweep.repository.pg';

/**
 * SealSweepPgRepository.reclaimStaleAuditJobs against real Postgres: an
 * `audit_only` job whose worker died (on the Edge runtime, a step killed at
 * the CPU or memory limit) is put back to `pending`, or marked `failed`
 * once out of attempts. Same harness as owner-read-rpcs.pg.e2e-spec.ts;
 * skipped without SUBMIT_SIGNER_DATABASE_URL, required in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `seal_sweep_audit_${randomBytes(4).toString('hex')}`;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the audit sweep spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('SealSweepPgRepository.reclaimStaleAuditJobs (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  const owner = randomUUID();

  async function envelopeWithJob(
    kind: 'audit_only' | 'seal',
    job: { status: string; attempts: number; startedMinutesAgo: number },
  ): Promise<string> {
    const env = await pool!.query<{ id: string }>(
      `insert into public.envelopes (owner_id, title, short_code, tc_version, privacy_version, expires_at, status)
       values ($1, 'x', $2, 'tc', 'pp', now(), $3) returning id`,
      [owner, randomBytes(7).toString('hex').slice(0, 13), kind === 'seal' ? 'sealing' : 'expired'],
    );
    const id = env.rows[0]!.id;
    await pool!.query(
      `insert into public.envelope_jobs (envelope_id, kind, status, attempts, started_at)
       values ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
      [id, kind, job.status, job.attempts, job.startedMinutesAgo],
    );
    return id;
  }

  async function job(envelopeId: string) {
    const r = await pool!.query<{
      status: string;
      started_at: Date | null;
      last_error: string | null;
    }>('select status, started_at, last_error from public.envelope_jobs where envelope_id = $1', [
      envelopeId,
    ]);
    return r.rows[0]!;
  }

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
      create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: {
        ...process.env,
        DATABASE_URL: dedicated.toString(),
        MIGRATIONS_DIR: resolve(__dirname, '../db/migrations'),
      },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    await pool.query('insert into auth.users (id) values ($1)', [owner]);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('requeues or fails stale audit_only jobs and leaves the rest alone', async () => {
    const retry = await envelopeWithJob('audit_only', {
      status: 'running',
      attempts: 1,
      startedMinutesAgo: 180,
    });
    const exhausted = await envelopeWithJob('audit_only', {
      status: 'running',
      attempts: 5,
      startedMinutesAgo: 60,
    });
    const fresh = await envelopeWithJob('audit_only', {
      status: 'running',
      attempts: 1,
      startedMinutesAgo: 2,
    });
    const seal = await envelopeWithJob('seal', {
      status: 'running',
      attempts: 1,
      startedMinutesAgo: 180,
    });

    const repo = new SealSweepPgRepository(db);
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const result = await repo.reclaimStaleAuditJobs(staleBefore, 100);

    expect([...result].sort((a, b) => a.envelopeId.localeCompare(b.envelopeId))).toEqual(
      [
        { envelopeId: retry, requeued: true },
        { envelopeId: exhausted, requeued: false },
      ].sort((a, b) => a.envelopeId.localeCompare(b.envelopeId)),
    );
    expect(await job(retry)).toMatchObject({ status: 'pending', started_at: null });
    expect((await job(exhausted)).status).toBe('failed');
    expect((await job(fresh)).status).toBe('running');
    // A stale seal job is the seal sweep's own path (findCandidates), not this one.
    expect((await job(seal)).status).toBe('running');

    expect(await repo.reclaimStaleAuditJobs(staleBefore, 100)).toEqual([]);
  });
});
