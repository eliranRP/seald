import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolClient } from 'pg';
import type { Database } from '../db/schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';

/**
 * Envelope writes that race another transaction, against real Postgres
 * (pg-mem has no row locks): `expireEnvelopes` re-checks `expires_at` so a
 * concurrent extension wins, and `rotateSignerAccessToken` locks the
 * envelope row like `correctSigner`, so it sees a cancel that commits
 * while it waits. Same harness contract as automations.pg.e2e-spec.ts.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `envelope_guards_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the envelope guards pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('envelope write guards (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  let repo: EnvelopesPgRepository;
  let ownerId: string;
  let codeCounter = 0;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
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
    repo = new EnvelopesPgRepository(db);
  }, 180_000);

  beforeEach(async () => {
    ownerId = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  /** A sent envelope with one signer. */
  async function seedSent(expiresAt: Date): Promise<{ envelopeId: string; signerId: string }> {
    codeCounter += 1;
    const e = await repo.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: `EG${String(codeCounter).padStart(11, '0')}`,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const s = await repo.addSigner(e.id, { email: 'a@example.com', name: 'A', color: '#111111' });
    await repo.sendDraft({ envelope_id: e.id, sender_email: 's@example.com', sender_name: 'S' });
    await pool!.query('update envelopes set expires_at = $2 where id = $1', [
      e.id,
      expiresAt.toISOString(),
    ]);
    return { envelopeId: e.id, signerId: s.id };
  }

  /** Hold the envelope row lock in another transaction until `release` runs. */
  async function lockEnvelope(envelopeId: string): Promise<PoolClient> {
    const holder = await pool!.connect();
    await holder.query('begin');
    await holder.query('select id from envelopes where id = $1 for update', [envelopeId]);
    return holder;
  }

  /** Resolve once `promise` has had time to reach (and block on) its lock. */
  async function settleSoon<T>(promise: Promise<T>): Promise<'pending' | 'settled'> {
    const timer = new Promise<'pending'>((r) => setTimeout(() => r('pending'), 300));
    return Promise.race([promise.then(() => 'settled' as const), timer]);
  }

  it('expireEnvelopes leaves an envelope whose expiry was extended while it waited', async () => {
    const { envelopeId } = await seedSent(new Date(Date.now() - 60_000));
    const holder = await lockEnvelope(envelopeId);
    let expiring: Promise<ReadonlyArray<string>>;
    try {
      // The sweep lists the envelope as due, then blocks on the row lock.
      expiring = repo.expireEnvelopes(new Date(), 50);
      expect(await settleSoon(expiring)).toBe('pending');
      // The owner extends the expiry (updateOpenExpiry) and commits first.
      await holder.query(
        `update envelopes set expires_at = now() + interval '7 days' where id = $1`,
        [envelopeId],
      );
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await expiring).not.toContain(envelopeId);
    const row = await pool!.query<{ status: string }>(
      'select status from envelopes where id = $1',
      [envelopeId],
    );
    expect(row.rows[0]?.status).toBe('awaiting_others');
  });

  it('rotateSignerAccessToken waits for the envelope lock and sees a cancel that committed', async () => {
    const { envelopeId, signerId } = await seedSent(new Date(Date.now() + 86_400_000));
    const holder = await lockEnvelope(envelopeId);
    let rotating: Promise<boolean>;
    try {
      rotating = repo.rotateSignerAccessToken(signerId, 'b'.repeat(64));
      expect(await settleSoon(rotating)).toBe('pending');
      await holder.query(`update envelopes set status = 'canceled' where id = $1`, [envelopeId]);
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await rotating).toBe(false);
    const signer = await pool!.query<{ access_token_hash: string | null }>(
      'select access_token_hash from envelope_signers where id = $1',
      [signerId],
    );
    expect(signer.rows[0]?.access_token_hash).not.toBe('b'.repeat(64));
  });
});
