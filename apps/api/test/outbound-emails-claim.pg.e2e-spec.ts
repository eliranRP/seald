import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { OUTBOUND_EMAIL_CLAIM_LEASE_MS } from '../src/email/outbound-emails.repository';
import { OutboundEmailsPgRepository } from '../src/email/outbound-emails.repository.pg';

/**
 * OUTBOUND_EMAIL_MACHINE `claim` on real Postgres (pg-mem cannot parse
 * `for update skip locked`). A claim takes a lease; a dispatcher that
 * dies before markSent leaves a `sending` row that is claimed again once
 * the lease runs out, or given up when its attempts are spent.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `outbound_claim_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the outbound claim spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('outbound_emails claim lease (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  let repo: OutboundEmailsPgRepository;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: dedicated.toString(), max: 5 });
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
    repo = new OutboundEmailsPgRepository(db);
  }, 180_000);

  beforeEach(async () => {
    await pool!.query('delete from public.outbound_emails');
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function queue(maxAttempts = 8): Promise<string> {
    const row = await repo.insert({
      envelope_id: null,
      signer_id: null,
      kind: 'automation_disabled',
      to_email: 'owner@example.com',
      to_name: 'Owner',
      payload: {},
      max_attempts: maxAttempts,
      scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    });
    return row.id;
  }

  async function read(id: string) {
    const res = await pool!.query<{
      status: string;
      attempts: number;
      scheduled_for: Date;
      last_error: string | null;
    }>(
      'select status, attempts, scheduled_for, last_error from public.outbound_emails where id = $1',
      [id],
    );
    return res.rows[0]!;
  }

  it('a claim holds the row for the lease, then a dead dispatcher’s row is claimed again', async () => {
    const id = await queue();
    const t0 = new Date();
    const first = await repo.claimNext(t0);
    expect(first?.id).toBe(id);
    const held = await read(id);
    expect(held.status).toBe('sending');
    expect(held.scheduled_for.getTime()).toBe(t0.getTime() + OUTBOUND_EMAIL_CLAIM_LEASE_MS);

    // Inside the lease nobody else takes it.
    expect(await repo.claimNext(new Date(t0.getTime() + 60_000))).toBeNull();

    // The dispatcher died; after the lease the row is sent again.
    const again = await repo.claimNext(new Date(t0.getTime() + OUTBOUND_EMAIL_CLAIM_LEASE_MS + 1));
    expect(again?.id).toBe(id);
    expect((await read(id)).attempts).toBe(2);
  });

  it('a dispatcher whose lease ran out cannot overwrite the newer claim (SM.3)', async () => {
    const id = await queue();
    const t0 = new Date();
    const a = await repo.claimNext(t0);
    const b = await repo.claimNext(new Date(t0.getTime() + OUTBOUND_EMAIL_CLAIM_LEASE_MS + 1));
    expect(b?.id).toBe(id);
    // A finally gets a transient error, then a success: neither lands.
    await repo.markFailed(id, {
      error: 'timeout',
      final: false,
      nextAttemptAt: new Date(t0.getTime() + 3_600_000),
      claimedAttempts: a!.attempts,
    });
    await repo.markSent(id, 'prv-a', new Date(), a!.attempts);
    await repo.markSkipped(id, 'late', a!.attempts);
    expect(await read(id)).toMatchObject({ status: 'sending', attempts: 2, last_error: null });
    // B's own write does.
    await repo.markSent(id, 'prv-b', new Date(), b!.attempts);
    expect((await read(id)).status).toBe('sent');
  });

  it('a stale sending row with no attempts left is given up, not claimed', async () => {
    const id = await queue(1);
    const t0 = new Date();
    expect((await repo.claimNext(t0))?.id).toBe(id);
    expect(
      await repo.claimNext(new Date(t0.getTime() + OUTBOUND_EMAIL_CLAIM_LEASE_MS + 1)),
    ).toBeNull();
    expect(await read(id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error: 'claim_lease_expired',
    });
  });

  it('migration 0053 leases recent rows stuck in sending and gives up old ones', async () => {
    const recent = await queue();
    const old = await queue();
    await pool!.query(
      `update public.outbound_emails set status = 'sending', attempts = 1,
              scheduled_for = now() - interval '5 minutes' where id = $1`,
      [recent],
    );
    await pool!.query(
      `update public.outbound_emails set status = 'sending', attempts = 1,
              scheduled_for = now() - interval '30 days' where id = $1`,
      [old],
    );
    await pool!.query(
      readFileSync(resolve(MIGRATIONS_DIR, '0053_outbound_email_claim_lease.sql'), 'utf8'),
    );
    const leased = await read(recent);
    expect(leased.status).toBe('sending');
    expect(leased.scheduled_for.getTime()).toBeGreaterThan(Date.now());
    expect(await read(old)).toMatchObject({
      status: 'failed',
      attempts: 8,
      last_error: 'stranded_before_claim_lease',
    });
    // Nothing is mailed now; the leased row comes back after its lease.
    expect(await repo.claimNext(new Date())).toBeNull();
  });

  it('a permanent failure is never claimed again', async () => {
    const id = await queue();
    const t0 = new Date();
    await repo.claimNext(t0);
    await repo.markFailed(id, { error: 'bad_address', final: true });
    expect(await repo.claimNext(new Date(t0.getTime() + 24 * 3_600_000))).toBeNull();
    expect((await read(id)).status).toBe('failed');
  });
});
