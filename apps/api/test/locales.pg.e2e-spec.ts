import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { setFlag } from './pades-e2e-harness';

/**
 * Migration 0035 (WP-38, locales) against real Postgres:
 *
 *   1. Adds nullable `envelopes.locale` / `envelope_signers.locale`, checked
 *      against the supported list ('en').
 *   2. EnvelopesPgRepository stores and returns both with `i18n` on, and
 *      leaves them off the domain objects with it off.
 *   3. Up -> down -> up is clean and idempotent.
 *
 * Own database on the CI Postgres (SUBMIT_SIGNER_DATABASE_URL). Skips
 * without the URL; in CI a missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `locales_0035_${randomUUID().slice(0, 8)}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const MIGRATE = resolve(__dirname, '../scripts/migrate.sh');
const UP = join(MIGRATIONS_DIR, '0035_locales.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0035_locales_down.sql');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so migration 0035 is tested against real Postgres',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('0035 locales (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool;
  let db: Kysely<Database>;
  let dedicatedUrl: string;
  let migrationsCopy: string;
  let owner: string;
  let envelope: string;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  async function migrate(dir: string): Promise<string> {
    const { stdout } = await execFileAsync('sh', [MIGRATE], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: dir },
    });
    return stdout;
  }

  async function hasColumn(table: string, column: string): Promise<boolean> {
    const res = await pool.query(
      `select 1 from information_schema.columns where table_name = $1 and column_name = $2`,
      [table, column],
    );
    return res.rows.length > 0;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'locales-0035-admin',
    });
    admin.on('error', () => undefined);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4, application_name: 'locales-0035' });
    pool.on('error', () => undefined);
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);

    // Prod before WP-38: every top-level migration except 0035.
    migrationsCopy = mkdtempSync(join(tmpdir(), 'migrations-0035-'));
    for (const name of readdirSync(MIGRATIONS_DIR)) {
      if (/^\d{4}_.+\.sql$/.test(name) && !name.startsWith('0035_')) {
        copyFileSync(join(MIGRATIONS_DIR, name), join(migrationsCopy, name));
      }
    }
    await migrate(migrationsCopy);

    owner = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [owner]);
    envelope = randomUUID();
    await pool.query(
      `insert into public.envelopes (id, owner_id, title, short_code, status, tc_version, privacy_version, expires_at)
       values ($1, $2, 'Locale', 'LOCALE0000001', 'draft', 'tc', 'pp', '2030-01-01T00:00:00Z')`,
      [envelope, owner],
    );
  }, 180_000);

  afterAll(async () => {
    setFlag('i18n', undefined);
    await db?.destroy().catch(() => undefined);
    if (migrationsCopy) rmSync(migrationsCopy, { recursive: true, force: true });
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  it('applies on the next boot and adds both columns', async () => {
    expect(await hasColumn('envelopes', 'locale')).toBe(false);
    expect(await hasColumn('envelope_signers', 'locale')).toBe(false);

    copyFileSync(UP, join(migrationsCopy, '0035_locales.sql'));
    const stdout = await migrate(migrationsCopy);
    expect(stdout.split('\n').filter((l) => l.startsWith('migrate: apply '))).toEqual([
      'migrate: apply 0035_locales.sql',
    ]);

    expect(await hasColumn('envelopes', 'locale')).toBe(true);
    expect(await hasColumn('envelope_signers', 'locale')).toBe(true);
    const res = await pool.query<{ locale: string | null }>(
      'select locale from public.envelopes where id = $1',
      [envelope],
    );
    expect(res.rows[0]?.locale).toBeNull();
  });

  it('refuses an unsupported locale on both tables and accepts en', async () => {
    await expect(
      pool.query(`update public.envelopes set locale = 'xx' where id = $1`, [envelope]),
    ).rejects.toThrow(/envelopes_locale_supported/);
    await pool.query(`update public.envelopes set locale = 'en' where id = $1`, [envelope]);
    await expect(
      pool.query(
        `insert into public.envelope_signers (envelope_id, email, name, color, locale)
         values ($1, 'x@example.com', 'X', '#112233', 'xx')`,
        [envelope],
      ),
    ).rejects.toThrow(/envelope_signers_locale_supported/);
    await pool.query(`update public.envelopes set locale = null where id = $1`, [envelope]);
  });

  it('round-trips locale through the repository with i18n on, and hides it with i18n off', async () => {
    setFlag('i18n', true);
    const repo = new EnvelopesPgRepository(db);
    const signer = await repo.addSigner(envelope, {
      email: 'maya@example.com',
      name: 'Maya',
      color: '#445566',
      locale: 'en',
    });
    expect(signer.locale).toBe('en');
    const patched = await repo.updateDraftMetadata(owner, envelope, { locale: 'en' });
    expect(patched).toMatchObject({ locale: 'en' });
    const read = await repo.findByIdForOwner(owner, envelope);
    expect(read).toMatchObject({ locale: 'en' });
    expect(read?.signers[0]).toMatchObject({ locale: 'en' });

    setFlag('i18n', false);
    const dark = await repo.findByIdForOwner(owner, envelope);
    expect(dark).not.toHaveProperty('locale');
    expect(dark?.signers[0]).not.toHaveProperty('locale');
  });

  it('down drops the columns and the record; up re-applies; both are idempotent', async () => {
    await psqlFile(DOWN);
    expect(await hasColumn('envelopes', 'locale')).toBe(false);
    expect(await hasColumn('envelope_signers', 'locale')).toBe(false);
    const rec = await pool.query(
      `select 1 from public.schema_migrations where filename = '0035_locales.sql'`,
    );
    expect(rec.rows).toHaveLength(0);

    await psqlFile(DOWN);

    await psqlFile(UP);
    await psqlFile(UP);
    expect(await hasColumn('envelopes', 'locale')).toBe(true);
    expect(await hasColumn('envelope_signers', 'locale')).toBe(true);
  });
});
