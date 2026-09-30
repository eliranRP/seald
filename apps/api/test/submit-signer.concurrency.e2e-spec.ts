import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type QueryResult } from 'pg';
import type { Database } from '../db/schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';

/**
 * Two final submitSigner calls, overlapping, against real Postgres.
 *
 * pg-mem parses FOR UPDATE and does not lock, so this file is excluded
 * from the unit runner. CI provides Postgres and psql. Without
 * SUBMIT_SIGNER_DATABASE_URL the suite skips, except in CI where a
 * missing URL is a failure.
 *
 * A third session holds the envelope row until both submissions are
 * blocked on it. That is the "same moment": both transactions are
 * inside submitSigner together. The row lock then lets one count 1/2
 * and the other, after it commits, count 2/2 and flip to sealing.
 * If the FOR UPDATE is removed, nobody waits, and this fails.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so submitSigner is tested against real Postgres locks',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('submitSigner concurrency (real Postgres)', () => {
  let pool: Pool | undefined;
  let db: Kysely<Database> | undefined;
  let repo: EnvelopesPgRepository | undefined;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      application_name: 'submit-signer-concurrency',
    });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    const migrationsDir = resolve(__dirname, '../db/migrations');
    const script = resolve(__dirname, '../scripts/migrate.sh');
    await execFileAsync('sh', [script], {
      env: { ...process.env, DATABASE_URL: databaseUrl, MIGRATIONS_DIR: migrationsDir },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new EnvelopesPgRepository(db);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it('seals exactly once when the last two signatures land together', async () => {
    if (!pool || !db || !repo) throw new Error('postgres harness did not start');
    const pg = pool;
    const database = db;
    const envelopes = repo;
    const ownerId = randomUUID();
    await pg.query('insert into auth.users (id) values ($1)', [ownerId]);
    const envelope = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Concurrent close',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    const ada = await readySigner(envelopes, envelope.id, 'ada@example.com');
    const bea = await readySigner(envelopes, envelope.id, 'bea@example.com');
    await database
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', envelope.id)
      .execute();

    const holder = await pg.connect();
    let committed = false;
    try {
      await holder.query('begin');
      await holder.query('select id from envelopes where id = $1 for update', [envelope.id]);

      const pending = Promise.all([
        envelopes.submitSigner(ada.id, null, null),
        envelopes.submitSigner(bea.id, null, null),
      ]);
      let waitError: Error | undefined;
      try {
        await waitForEnvelopeLockWaiters(pg, 2);
      } catch (err) {
        waitError = err instanceof Error ? err : new Error(String(err));
      }
      await holder.query('commit');
      committed = true;

      const [first, second] = await pending;
      if (waitError) throw waitError;

      const results = [first, second];
      expect(results.every((result) => result !== null)).toBe(true);
      const sealed = results.filter((result) => result?.all_signed === true);
      const waiting = results.filter((result) => result?.all_signed === false);
      expect(sealed).toHaveLength(1);
      expect(waiting).toHaveLength(1);
      expect(sealed[0]?.envelope_status).toBe('sealing');
      expect(sealed[0]?.done).toBe(2);
      expect(sealed[0]?.total).toBe(2);
      expect(waiting[0]?.done).toBe(1);
      expect(waiting[0]?.envelope_status).toBe('awaiting_others');

      const stored = await envelopes.findByIdWithAll(envelope.id);
      expect(stored?.status).toBe('sealing');
      expect(stored?.signers.filter((signer) => signer.signed_at !== null)).toHaveLength(2);
    } finally {
      if (!committed) await holder.query('rollback');
      holder.release();
    }
  }, 30_000);
});

async function readySigner(
  repo: EnvelopesPgRepository,
  envelopeId: string,
  email: string,
): Promise<{ id: string }> {
  const signer = await repo.addSigner(envelopeId, { email, name: email, color: '#112233' });
  await repo.acceptTerms(signer.id);
  await repo.setSignerSignature(signer.id, {
    signature_format: 'typed',
    signature_image_path: `sigs/${signer.id}.png`,
  });
  return signer;
}

async function waitForEnvelopeLockWaiters(pool: Pool, expected: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  let last = '[]';
  while (Date.now() < deadline) {
    const res: QueryResult<{ query: string | null }> = await pool.query(
      `select left(query, 240) as query
         from pg_stat_activity
        where application_name = 'submit-signer-concurrency'
          and pid <> pg_backend_pid()
          and state = 'active'
          and wait_event_type = 'Lock'
          and query ilike '%for update%'`,
    );
    last = JSON.stringify(res.rows);
    if ((res.rowCount ?? 0) >= expected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(
    `expected ${expected} sessions waiting on the envelope FOR UPDATE; saw ${last}. ` +
      'submitSigner must lock the envelope row or the two final signatures can both count total - 1 and never seal.',
  );
}
