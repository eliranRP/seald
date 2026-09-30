import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

/**
 * Migration 0021 against real Postgres.
 *
 * CI's API e2e job already runs Postgres 17 and sets
 * SUBMIT_SIGNER_DATABASE_URL (the same service the submitSigner
 * concurrency spec uses). This file opens its own database on that
 * server so it does not take ACCESS EXCLUSIVE on the shared `seald`
 * database. Without the URL the suite skips. In CI a missing URL fails
 * the file, matching submit-signer.concurrency.e2e-spec.ts.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = 'gdrive_0021_ci';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so migration 0021 is tested against real Postgres',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('0021 gdrive token erasure (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'gdrive-0021-admin',
    });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({
      connectionString: dedicatedUrl,
      max: 4,
      application_name: 'gdrive-0021',
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
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: migrationsDir },
    });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('applies 0021, cascades on user delete, and clears disconnected tokens idempotently', async () => {
    if (!pool || !databaseUrl) throw new Error('postgres harness did not start');
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();

    const owner = randomUUID();
    const other = randomUUID();
    await pool.query('insert into auth.users (id) values ($1), ($2)', [owner, other]);

    const activeId = randomUUID();
    const disconnectedId = randomUUID();
    const otherId = randomUUID();
    await pool.query(
      `insert into public.gdrive_accounts
         (id, user_id, google_user_id, google_email, refresh_token_ciphertext,
          refresh_token_kms_key_arn, scope, deleted_at)
       values
         ($1, $2, 'g-live', 'live@example.com', convert_to('live-secret', 'UTF8'),
          'arn:live', 'https://www.googleapis.com/auth/drive.file', null),
         ($3, $2, 'g-old', 'old@example.com', convert_to('old-secret', 'UTF8'),
          'arn:old', 'https://www.googleapis.com/auth/drive.file', '2026-01-01T00:00:00Z'),
         ($4, $5, 'g-other', 'other@example.com', convert_to('other-secret', 'UTF8'),
          'arn:other', 'https://www.googleapis.com/auth/drive.file', '2026-02-01T00:00:00Z')`,
      [activeId, owner, disconnectedId, otherId, other],
    );

    const file = resolve(__dirname, '../db/migrations/0021_gdrive_token_erasure.sql');
    const apply = () =>
      execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
    await apply();

    const fk = await pool.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname = 'gdrive_accounts_user_id_fkey'`,
    );
    expect(fk.rows).toHaveLength(1);
    expect(fk.rows[0]?.def.toLowerCase()).toContain('on delete cascade');

    const afterFirst = await pool.query<{
      id: string;
      refresh_token_ciphertext: Buffer | null;
      refresh_token_kms_key_arn: string | null;
    }>(
      'select id, refresh_token_ciphertext, refresh_token_kms_key_arn from public.gdrive_accounts',
    );
    const byId = new Map(afterFirst.rows.map((row) => [row.id, row]));
    expect(byId.get(activeId)?.refresh_token_ciphertext?.toString('utf8')).toBe('live-secret');
    expect(byId.get(activeId)?.refresh_token_kms_key_arn).toBe('arn:live');
    expect(byId.get(disconnectedId)?.refresh_token_ciphertext).toBeNull();
    expect(byId.get(disconnectedId)?.refresh_token_kms_key_arn).toBeNull();
    expect(byId.get(otherId)?.refresh_token_ciphertext).toBeNull();
    expect(byId.get(otherId)?.refresh_token_kms_key_arn).toBeNull();

    await apply();
    const afterSecond = await pool.query<{
      id: string;
      refresh_token_ciphertext: Buffer | null;
      refresh_token_kms_key_arn: string | null;
    }>(
      'select id, refresh_token_ciphertext, refresh_token_kms_key_arn from public.gdrive_accounts',
    );
    const again = new Map(afterSecond.rows.map((row) => [row.id, row]));
    expect(again.get(activeId)?.refresh_token_ciphertext?.toString('utf8')).toBe('live-secret');
    expect(again.get(activeId)?.refresh_token_kms_key_arn).toBe('arn:live');
    expect(again.get(disconnectedId)?.refresh_token_ciphertext).toBeNull();
    expect(again.get(otherId)?.refresh_token_kms_key_arn).toBeNull();

    await pool.query('delete from auth.users where id = $1', [owner]);
    const ownerRows = await pool.query('select id from public.gdrive_accounts where user_id = $1', [
      owner,
    ]);
    expect(ownerRows.rows).toEqual([]);
    const otherRows = await pool.query<{ id: string }>(
      'select id from public.gdrive_accounts where user_id = $1',
      [other],
    );
    expect(otherRows.rows.map((row) => row.id)).toEqual([otherId]);
  });
});
