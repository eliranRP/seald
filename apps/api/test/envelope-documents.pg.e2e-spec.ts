import { execFile } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { EnvelopeDocumentsPgRepository } from '../src/envelopes/documents/envelope-documents.repository.pg';
import {
  DocumentEnvelopeNotDraftError,
  TooManyDocumentsError,
} from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';

/**
 * Migration 0022 (WP-03, multi-file envelopes) against real Postgres:
 *
 *   1. Prod shape: every migration up to 0027 applied, 0022 missing. The
 *      runner (scripts/migrate.sh) must apply 0022 on the next boot even
 *      though a higher id is recorded, and skip 0027.
 *   2. Backfill: one document per existing envelope pointing at its
 *      current paths and hashes; every field gets that document.
 *   3. Compat triggers: new envelopes get document 1, fields inserted
 *      without document_id land on it, and legacy column writes mirror
 *      into it.
 *   4. EnvelopeDocumentsPgRepository: insert / cap / reorder / remove /
 *      setSealed, including the legacy-column mirror on slot-1 changes.
 *   5. Up → down → up, with the up re-applied for idempotency.
 *
 * Uses its own database on the CI Postgres (SUBMIT_SIGNER_DATABASE_URL),
 * like gdrive-token-erasure.pg.e2e-spec.ts. Skips without the URL; in CI a
 * missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
// Unique per run: suites from parallel jobs share one Postgres server.
const DB_NAME = `envelope_docs_0022_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const MIGRATE = resolve(__dirname, '../scripts/migrate.sh');
const UP = join(MIGRATIONS_DIR, '0022_envelope_documents.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0022_envelope_documents_down.sql');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'SUBMIT_SIGNER_DATABASE_URL is required in CI so migration 0022 is tested against real Postgres',
  );
}

const describePg = databaseUrl ? describe : describe.skip;

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

describePg('0022 envelope documents (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool;
  let db: Kysely<Database>;
  let dedicatedUrl: string;
  let migrationsCopy: string;
  let owner: string;
  let sealedEnv: string;
  let draftEnv: string;
  let sealedFields: string[];

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  async function migrate(dir: string): Promise<string> {
    const { stdout } = await execFileAsync('sh', [MIGRATE], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: dir },
    });
    return stdout;
  }

  let shortCodeSeq = 0;
  async function insertEnvelope(
    status: string,
    extra: Record<string, string | number | null> = {},
  ): Promise<string> {
    shortCodeSeq += 1;
    const id = randomUUID();
    const cols = {
      id,
      owner_id: owner,
      title: `Envelope ${shortCodeSeq}`,
      short_code: `DOC${String(shortCodeSeq).padStart(10, '0')}`,
      status,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: '2030-01-01T00:00:00Z',
      ...extra,
    };
    const keys = Object.keys(cols);
    await pool.query(
      `insert into public.envelopes (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(cols),
    );
    return id;
  }

  async function insertSigner(envelope_id: string, email: string): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into public.envelope_signers (id, envelope_id, email, name, color)
       values ($1, $2, $3, 'Signer', '#112233')`,
      [id, envelope_id, email],
    );
    return id;
  }

  async function insertField(envelope_id: string, signer_id: string, page = 1): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into public.envelope_fields (id, envelope_id, signer_id, kind, page, x, y)
       values ($1, $2, $3, 'signature', $4, 0.1, 0.1)`,
      [id, envelope_id, signer_id, page],
    );
    return id;
  }

  async function docsOf(envelope_id: string): Promise<
    Array<{
      id: string;
      ord: number;
      title: string;
      original_file_path: string | null;
      original_sha256: string | null;
      sealed_file_path: string | null;
      sealed_sha256: string | null;
    }>
  > {
    const res = await pool.query(
      `select id, ord, title, original_file_path, original_sha256, sealed_file_path, sealed_sha256
         from public.envelope_documents where envelope_id = $1 order by ord`,
      [envelope_id],
    );
    return res.rows;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'docs-0022-admin',
    });
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4, application_name: 'docs-0022' });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);

    // Prod before WP-03: every top-level migration except 0022.
    migrationsCopy = mkdtempSync(join(tmpdir(), 'migrations-0022-'));
    for (const name of readdirSync(MIGRATIONS_DIR)) {
      if (/^\d{4}_.+\.sql$/.test(name) && !name.startsWith('0022_')) {
        copyFileSync(join(MIGRATIONS_DIR, name), join(migrationsCopy, name));
      }
    }
    await migrate(migrationsCopy);

    owner = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [owner]);
    sealedEnv = await insertEnvelope('completed', {
      original_file_path: 'x/original.pdf',
      original_sha256: SHA_A,
      original_pages: 3,
      sealed_file_path: 'x/sealed.pdf',
      sealed_sha256: SHA_B,
      audit_file_path: 'x/audit.pdf',
    });
    const signer = await insertSigner(sealedEnv, 'a@example.com');
    sealedFields = [await insertField(sealedEnv, signer), await insertField(sealedEnv, signer, 2)];
    draftEnv = await insertEnvelope('draft');
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (migrationsCopy) rmSync(migrationsCopy, { recursive: true, force: true });
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('applies 0022 on the next boot although 0027 is already recorded, and skips 0027', async () => {
    const before = await pool.query<{ filename: string }>(
      'select filename from public.schema_migrations order by filename',
    );
    const names = before.rows.map((r) => r.filename);
    expect(names).toContain('0027_signer_token_dispatch.sql');
    expect(names).not.toContain('0022_envelope_documents.sql');

    copyFileSync(UP, join(migrationsCopy, '0022_envelope_documents.sql'));
    const stdout = await migrate(migrationsCopy);

    expect(stdout).toContain('apply 0022_envelope_documents.sql');
    expect(stdout).toContain('skip 0027_signer_token_dispatch.sql (already applied)');
    const applied = stdout.split('\n').filter((l) => l.startsWith('migrate: apply '));
    expect(applied).toEqual(['migrate: apply 0022_envelope_documents.sql']);
  });

  it('backfills one document per envelope and points every field at it', async () => {
    const sealedDocs = await docsOf(sealedEnv);
    expect(sealedDocs).toHaveLength(1);
    expect(sealedDocs[0]).toMatchObject({
      ord: 1,
      title: expect.stringMatching(/^Envelope /),
      original_file_path: 'x/original.pdf',
      original_sha256: SHA_A,
      sealed_file_path: 'x/sealed.pdf',
      sealed_sha256: SHA_B,
    });
    const draftDocs = await docsOf(draftEnv);
    expect(draftDocs).toHaveLength(1);
    expect(draftDocs[0]).toMatchObject({ ord: 1, original_file_path: null, sealed_sha256: null });

    const fields = await pool.query<{ id: string; document_id: string }>(
      'select id, document_id from public.envelope_fields where envelope_id = $1',
      [sealedEnv],
    );
    expect(fields.rows.map((r) => r.document_id)).toEqual(
      sealedFields.map(() => sealedDocs[0]!.id),
    );
    const col = await pool.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_name = 'envelope_fields' and column_name = 'document_id'`,
    );
    expect(col.rows[0]?.is_nullable).toBe('NO');
    const rls = await pool.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'envelope_documents'`,
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
  });

  it('keeps single-file writers working through the compat triggers', async () => {
    const legacy = new EnvelopesPgRepository(db);
    const env = await insertEnvelope('draft');
    const docs = await docsOf(env);
    expect(docs).toHaveLength(1);
    const signer = await insertSigner(env, 'legacy@example.com');

    // Legacy replaceFields: no document_id in the insert.
    const fields = await legacy.replaceFields(env, [
      { signer_id: signer, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
    ]);
    expect(fields).toHaveLength(1);
    const map = await new EnvelopeDocumentsPgRepository(db).listFieldDocumentIds(env);
    expect(map.get(fields[0]!.id)).toBe(docs[0]!.id);

    // Legacy upload writes only the envelope row; document 1 mirrors it.
    await legacy.setOriginalFile(env, {
      file_path: `${env}/original.pdf`,
      sha256: SHA_C,
      pages: 2,
    });
    const after = await docsOf(env);
    expect(after[0]).toMatchObject({
      id: docs[0]!.id,
      original_file_path: `${env}/original.pdf`,
      original_sha256: SHA_C,
    });
  });

  it('adds, caps, reorders, seals and removes documents with document 1 mirrored on the envelope', async () => {
    const repo = new EnvelopeDocumentsPgRepository(db);
    const env = await insertEnvelope('draft', {
      original_file_path: 'e/original.pdf',
      original_sha256: SHA_A,
      original_pages: 1,
    });
    const [first] = await docsOf(env);
    const second = await repo.insertDocument({
      id: randomUUID(),
      envelope_id: env,
      title: 'Annex',
      original_file_path: `e/documents/x/original.pdf`,
      original_sha256: SHA_B,
      original_pages: 4,
      max_documents: 2,
    });
    expect(second.ord).toBe(2);
    await expect(
      repo.insertDocument({
        id: randomUUID(),
        envelope_id: env,
        title: 'Too many',
        original_file_path: 'e/documents/y/original.pdf',
        original_sha256: SHA_C,
        original_pages: 1,
        max_documents: 2,
      }),
    ).rejects.toBeInstanceOf(TooManyDocumentsError);

    const signer = await insertSigner(env, 'r@example.com');
    const onFirst = await insertField(env, signer);
    const onSecond = randomUUID();
    await pool.query(
      `insert into public.envelope_fields (id, envelope_id, signer_id, document_id, kind, page, x, y)
       values ($1, $2, $3, $4, 'signature', 1, 0.2, 0.2)`,
      [onSecond, env, signer, second.id],
    );

    // A field cannot point at another envelope's document.
    await expect(
      pool.query(
        `insert into public.envelope_fields (envelope_id, signer_id, document_id, kind, page, x, y)
         values ($1, $2, $3, 'signature', 1, 0.2, 0.2)`,
        [env, signer, (await docsOf(draftEnv))[0]!.id],
      ),
    ).rejects.toThrow(/envelope_fields_document_fk/);

    const reordered = await repo.reorder(env, [second.id, first!.id]);
    expect(reordered.map((d) => [d.id, d.ord])).toEqual([
      [second.id, 1],
      [first!.id, 2],
    ]);
    const envRow = await pool.query(
      'select original_file_path, original_sha256, original_pages from public.envelopes where id = $1',
      [env],
    );
    expect(envRow.rows[0]).toEqual({
      original_file_path: 'e/documents/x/original.pdf',
      original_sha256: SHA_B,
      original_pages: 4,
    });
    const links = await repo.listFieldDocumentIds(env);
    expect(links.get(onFirst)).toBe(first!.id);
    expect(links.get(onSecond)).toBe(second.id);

    const removed = await repo.removeDocument(env, second.id);
    expect(removed?.id).toBe(second.id);
    const left = await docsOf(env);
    expect(left.map((d) => [d.id, d.ord])).toEqual([[first!.id, 1]]);
    const envAfter = await pool.query(
      'select original_sha256 from public.envelopes where id = $1',
      [env],
    );
    expect(envAfter.rows[0]?.original_sha256).toBe(SHA_A);
    const fieldsLeft = await pool.query<{ id: string }>(
      'select id from public.envelope_fields where envelope_id = $1',
      [env],
    );
    expect(fieldsLeft.rows.map((r) => r.id)).toEqual([onFirst]);

    await repo.setSealed(first!.id, 'e/sealed.pdf', SHA_C);
    expect((await docsOf(env))[0]).toMatchObject({
      sealed_file_path: 'e/sealed.pdf',
      sealed_sha256: SHA_C,
    });

    await expect(
      repo.insertDocument({
        id: randomUUID(),
        envelope_id: sealedEnv,
        title: 'Late',
        original_file_path: 'x/documents/z/original.pdf',
        original_sha256: SHA_C,
        original_pages: 1,
        max_documents: 10,
      }),
    ).rejects.toBeInstanceOf(DocumentEnvelopeNotDraftError);
  });

  it('is idempotent, and survives up → down → up', async () => {
    const countDocs = async (): Promise<number> =>
      Number(
        (await pool.query('select count(*)::int as n from public.envelope_documents')).rows[0].n,
      );
    const before = await countDocs();
    await psqlFile(UP);
    expect(await countDocs()).toBe(before);

    await pool.query(
      `insert into public.envelope_events (envelope_id, actor_kind, event_type, metadata)
       values ($1, 'sender', 'document_added', '{}')`,
      [draftEnv],
    );

    await psqlFile(DOWN);
    const table = await pool.query(`select to_regclass('public.envelope_documents') as t`);
    expect(table.rows[0].t).toBeNull();
    const col = await pool.query(
      `select 1 from information_schema.columns
        where table_name = 'envelope_fields' and column_name = 'document_id'`,
    );
    expect(col.rowCount).toBe(0);
    const label = await pool.query(
      `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'event_type' and e.enumlabel = 'document_added'`,
    );
    expect(label.rowCount).toBe(0);
    const rewritten = await pool.query<{ event_type: string }>(
      'select event_type from public.envelope_events where envelope_id = $1',
      [draftEnv],
    );
    expect(rewritten.rows.map((r) => r.event_type)).toEqual(['pdf_uploaded']);
    // Down is idempotent too.
    await psqlFile(DOWN);

    await psqlFile(UP);
    const envelopes = Number(
      (await pool.query('select count(*)::int as n from public.envelopes')).rows[0].n,
    );
    expect(await countDocs()).toBe(envelopes);
    const nullDocs = await pool.query(
      'select 1 from public.envelope_fields where document_id is null',
    );
    expect(nullDocs.rowCount).toBe(0);
    expect((await docsOf(sealedEnv))[0]).toMatchObject({ sealed_sha256: SHA_B });
  });
});
