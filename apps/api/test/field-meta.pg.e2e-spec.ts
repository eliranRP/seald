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
 * Migration 0024 (WP-07, field meta) against real Postgres:
 *
 *   1. Applies on top of every other migration, adds the four kinds, the
 *      `meta` column (default `{}`, object-only) and the envelope
 *      `date_format` / `timezone` columns.
 *   2. EnvelopesPgRepository stores and returns meta and the date settings
 *      with `fieldMetaV2` on, and leaves them off the domain objects with it
 *      off, so responses are unchanged while the flag is dark.
 *   3. Up → down → up: the down deletes rows of the new kinds, drops the
 *      columns and clones the enum back to six labels; the up re-applies.
 *
 * Own database on the CI Postgres (SUBMIT_SIGNER_DATABASE_URL). Skips
 * without the URL; in CI a missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `field_meta_0024_${randomUUID().slice(0, 8)}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const MIGRATE = resolve(__dirname, '../scripts/migrate.sh');
const UP = join(MIGRATIONS_DIR, '0024_field_meta.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0024_field_meta_down.sql');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so migration 0024 is tested against real Postgres',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('0024 field meta (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool;
  let db: Kysely<Database>;
  let dedicatedUrl: string;
  let migrationsCopy: string;
  let owner: string;
  let envelope: string;
  let signer: string;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  async function migrate(dir: string): Promise<string> {
    const { stdout } = await execFileAsync('sh', [MIGRATE], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: dir },
    });
    return stdout;
  }

  async function kindLabels(): Promise<string[]> {
    const res = await pool.query<{ enumlabel: string }>(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'field_kind' order by e.enumsortorder`,
    );
    return res.rows.map((r) => r.enumlabel);
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
      application_name: 'meta-0024-admin',
    });
    admin.on('error', () => undefined);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4, application_name: 'meta-0024' });
    pool.on('error', () => undefined);
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);

    // Prod before WP-07: every top-level migration except 0024.
    migrationsCopy = mkdtempSync(join(tmpdir(), 'migrations-0024-'));
    for (const name of readdirSync(MIGRATIONS_DIR)) {
      if (/^\d{4}_.+\.sql$/.test(name) && !name.startsWith('0024_')) {
        copyFileSync(join(MIGRATIONS_DIR, name), join(migrationsCopy, name));
      }
    }
    await migrate(migrationsCopy);

    owner = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [owner]);
    envelope = randomUUID();
    await pool.query(
      `insert into public.envelopes (id, owner_id, title, short_code, status, tc_version, privacy_version, expires_at)
       values ($1, $2, 'Meta', 'META000000001', 'draft', 'tc', 'pp', '2030-01-01T00:00:00Z')`,
      [envelope, owner],
    );
    signer = randomUUID();
    await pool.query(
      `insert into public.envelope_signers (id, envelope_id, email, name, color)
       values ($1, $2, 'a@example.com', 'Signer', '#112233')`,
      [signer, envelope],
    );
  }, 180_000);

  afterAll(async () => {
    setFlag('fieldMetaV2', undefined);
    await db?.destroy().catch(() => undefined);
    if (migrationsCopy) rmSync(migrationsCopy, { recursive: true, force: true });
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  it('applies on the next boot and adds kinds, meta and the envelope settings', async () => {
    expect(await kindLabels()).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
    ]);
    expect(await hasColumn('envelope_fields', 'meta')).toBe(false);

    copyFileSync(UP, join(migrationsCopy, '0024_field_meta.sql'));
    const stdout = await migrate(migrationsCopy);
    expect(stdout.split('\n').filter((l) => l.startsWith('migrate: apply '))).toEqual([
      'migrate: apply 0024_field_meta.sql',
    ]);

    expect(await kindLabels()).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
      'name',
      'number',
      'radio',
      'dropdown',
    ]);
    expect(await hasColumn('envelope_fields', 'meta')).toBe(true);
    expect(await hasColumn('envelopes', 'date_format')).toBe(true);
    expect(await hasColumn('envelopes', 'timezone')).toBe(true);
  });

  it('defaults meta to {} and refuses a non-object', async () => {
    const id = randomUUID();
    await pool.query(
      `insert into public.envelope_fields (id, envelope_id, signer_id, kind, page, x, y)
       values ($1, $2, $3, 'text', 1, 0.1, 0.1)`,
      [id, envelope, signer],
    );
    const row = await pool.query<{ meta: unknown }>(
      'select meta from public.envelope_fields where id = $1',
      [id],
    );
    expect(row.rows[0]?.meta).toEqual({});
    await expect(
      pool.query(`update public.envelope_fields set meta = '[]'::jsonb where id = $1`, [id]),
    ).rejects.toThrow(/envelope_fields_meta_is_object/);
    await pool.query('delete from public.envelope_fields where id = $1', [id]);
  });

  it('round-trips meta and the date settings through the repository, flag on', async () => {
    setFlag('fieldMetaV2', true);
    const repo = new EnvelopesPgRepository(db);
    const meta = { options: [{ label: 'Small', value: 's' }], default: 's', font_size: 14 };
    const fields = await repo.replaceFields(envelope, [
      { signer_id: signer, kind: 'radio', page: 1, x: 0.1, y: 0.1, required: true, meta },
      {
        signer_id: signer,
        kind: 'number',
        page: 1,
        x: 0.1,
        y: 0.2,
        required: true,
        meta: { min: 1 },
      },
      { signer_id: signer, kind: 'name', page: 1, x: 0.1, y: 0.3, required: true },
      { signer_id: signer, kind: 'dropdown', page: 1, x: 0.1, y: 0.4, required: true, meta },
    ]);
    expect(fields.map((f) => f.kind)).toEqual(['radio', 'number', 'name', 'dropdown']);
    expect(fields[0]?.meta).toEqual(meta);
    expect(fields[2]?.meta).toEqual({});

    const patched = await repo.updateDraftMetadata(owner, envelope, {
      date_format: 'dd.MM.yyyy',
      timezone: 'Europe/Berlin',
    });
    expect(patched).toMatchObject({ date_format: 'dd.MM.yyyy', timezone: 'Europe/Berlin' });
    const read = await repo.findByIdForOwner(owner, envelope);
    expect(read?.fields.find((f) => f.kind === 'dropdown')?.meta).toEqual(meta);
    expect(read).toMatchObject({ date_format: 'dd.MM.yyyy', timezone: 'Europe/Berlin' });
  });

  it('adds nothing to the domain objects with the flag off', async () => {
    setFlag('fieldMetaV2', false);
    const repo = new EnvelopesPgRepository(db);
    const read = await repo.findByIdForOwner(owner, envelope);
    expect(read).not.toHaveProperty('date_format');
    expect(read).not.toHaveProperty('timezone');
    for (const f of read?.fields ?? []) expect(f).not.toHaveProperty('meta');
  });

  it('down deletes new-kind rows, drops the columns and restores six labels; up re-applies', async () => {
    await psqlFile(DOWN);
    expect(await kindLabels()).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
    ]);
    expect(await hasColumn('envelope_fields', 'meta')).toBe(false);
    expect(await hasColumn('envelopes', 'date_format')).toBe(false);
    expect(await hasColumn('envelopes', 'timezone')).toBe(false);
    const left = await pool.query(`select 1 from public.envelope_fields where envelope_id = $1`, [
      envelope,
    ]);
    expect(left.rows).toHaveLength(0);
    const rec = await pool.query(
      `select 1 from public.schema_migrations where filename = '0024_field_meta.sql'`,
    );
    expect(rec.rows).toHaveLength(0);

    // Down is idempotent.
    await psqlFile(DOWN);

    await psqlFile(UP);
    await psqlFile(UP); // up is idempotent
    expect(await kindLabels()).toContain('dropdown');
    expect(await hasColumn('envelope_fields', 'meta')).toBe(true);
  });
});
