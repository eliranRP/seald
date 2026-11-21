import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { GDrivePgRepository } from '../src/integrations/gdrive/gdrive.repository.pg';
import { SCAN_UPLOAD_CLAIM_STALE_MS } from '../src/scan-sessions/scan-sessions.repository';
import { ScanSessionsPgRepository } from '../src/scan-sessions/scan-sessions.repository.pg';
import { StagedUploadsPgRepository } from '../src/uploads/staged-uploads.repository.pg';

/**
 * Row-conditional lifecycle writes on real Postgres: a scan session left
 * `uploading` by a crashed phone (migration 0054), the staged-upload
 * complete and claim release, and a Drive token rotation racing a
 * disconnect. Each write must refuse a row that left the state it guards.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `lifecycle_guards_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the lifecycle guards spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('lifecycle guards (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  const ownerId = randomUUID();

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
    await pool.query('insert into auth.users (id) values ($1)', [ownerId]);
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  describe('scan_sessions claim takeover (0054)', () => {
    let repo: ScanSessionsPgRepository;
    beforeAll(() => {
      repo = new ScanSessionsPgRepository(db);
    });

    async function session(): Promise<string> {
      const row = await repo.insert({
        id: randomUUID(),
        owner_id: ownerId,
        code_hash: randomBytes(32).toString('hex'),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      return row.id;
    }

    it('takes over only a stale upload, and the stale phone cannot finish (SM.3)', async () => {
      const id = await session();
      const t0 = Date.now() - 5 * 60_000;
      const at = (ms: number) => new Date(t0 + ms).toISOString();

      const first = await repo.claim(id, at(0));
      expect(first).toBe(at(0));
      // A live upload is not taken over.
      expect(await repo.claim(id, at(SCAN_UPLOAD_CLAIM_STALE_MS - 1))).toBeNull();
      // The phone crashed: past the bound the next upload takes it.
      const second = await repo.claim(id, at(SCAN_UPLOAD_CLAIM_STALE_MS));
      expect(second).toBe(at(SCAN_UPLOAD_CLAIM_STALE_MS));

      // The first phone wakes up: it can neither release nor finish.
      await repo.release(id, first!);
      const input = { storage_key: 'k-first', page_count: 1, byte_length: 10 };
      expect(await repo.markReceived(id, first!, input, at(SCAN_UPLOAD_CLAIM_STALE_MS + 1))).toBe(
        false,
      );
      const mid = await db
        .selectFrom('scan_sessions')
        .select(['status'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(mid.status).toBe('uploading');

      const done = { storage_key: 'k-second', page_count: 2, byte_length: 20 };
      expect(await repo.markReceived(id, second!, done, at(SCAN_UPLOAD_CLAIM_STALE_MS + 2))).toBe(
        true,
      );
      const row = await repo.findByHash(
        (
          await db
            .selectFrom('scan_sessions')
            .select('code_hash')
            .where('id', '=', id)
            .executeTakeFirstOrThrow()
        ).code_hash,
      );
      expect(row).toMatchObject({ status: 'received', storage_key: 'k-second', page_count: 2 });
      // Received is not claimable, stale or not.
      expect(await repo.claim(id, at(4 * SCAN_UPLOAD_CLAIM_STALE_MS))).toBeNull();
    });

    it('treats an uploading row from before 0054 (no stamp) as stale', async () => {
      const id = await session();
      await pool!.query(
        `update public.scan_sessions set status = 'uploading', claimed_at = null where id = $1`,
        [id],
      );
      const now = new Date().toISOString();
      expect(await repo.claim(id, now)).toBe(now);
    });

    it('never claims an expired session', async () => {
      const id = await session();
      await pool!.query(
        `update public.scan_sessions set expires_at = now() - interval '1 second' where id = $1`,
        [id],
      );
      expect(await repo.claim(id, new Date().toISOString())).toBeNull();
    });
  });

  describe('mcp_uploads complete and releaseClaim', () => {
    let repo: StagedUploadsPgRepository;
    beforeAll(() => {
      repo = new StagedUploadsPgRepository(db);
    });

    async function staged(expiresInMs: number): Promise<string> {
      const row = await repo.insert({
        id: randomUUID(),
        owner_id: ownerId,
        storage_key: `mcp-uploads/${randomUUID()}.pdf`,
        filename: 'a.pdf',
        source: 'upload',
        expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      });
      return row.id;
    }

    const completeInput = (id: string) => ({
      id,
      owner_id: ownerId,
      mime: 'application/pdf',
      sha256: 'a'.repeat(64),
      byte_length: 100,
      page_count: 1,
      daily_cap: 1000,
    });

    it('does not complete an upload past expires_at', async () => {
      const id = await staged(-1000);
      expect(await repo.complete(completeInput(id))).toBe('expired');
      expect((await repo.find(ownerId, id))?.completed_at).toBeNull();
      // A live one completes; a second complete is not_pending.
      const live = await staged(60_000);
      expect(await repo.complete(completeInput(live))).toBe('completed');
      expect(await repo.complete(completeInput(live))).toBe('not_pending');
    });

    it('releases only the caller’s own claim', async () => {
      const id = await staged(60_000);
      expect(await repo.complete(completeInput(id))).toBe('completed');
      const first = await repo.consume(ownerId, id);
      expect(first?.consumed_at).not.toBeNull();
      await repo.releaseClaim(ownerId, id, first!.consumed_at!);
      expect((await repo.find(ownerId, id))?.consumed_at).toBeNull();

      // A second claim holds the row now; a stale release of an older
      // stamp (or any other value) must not un-consume it.
      const second = await repo.consume(ownerId, id);
      expect(second).not.toBeNull();
      await repo.releaseClaim(ownerId, id, new Date(Date.now() - 60_000).toISOString());
      expect((await repo.find(ownerId, id))?.consumed_at).toBe(second!.consumed_at);
    });
  });

  describe('gdrive_accounts replaceToken', () => {
    let repo: GDrivePgRepository;
    beforeAll(() => {
      repo = new GDrivePgRepository(db);
    });

    it('does not put a token back on a disconnected account', async () => {
      const id = randomUUID();
      await repo.insert({
        id,
        userId: ownerId,
        googleUserId: `g-${id}`,
        googleEmail: 'owner@example.com',
        refreshTokenCiphertext: Buffer.from('old-token'),
        refreshTokenKmsKeyArn: 'local:v1',
        scope: 'https://www.googleapis.com/auth/drive.file',
        connectedAt: new Date().toISOString(),
        lastUsedAt: null,
        deletedAt: null,
      });
      expect(await repo.disconnect(id, ownerId)).toBe(true);
      const rotated = await repo.replaceToken({
        id,
        refreshTokenCiphertext: Buffer.from('new-token'),
        refreshTokenKmsKeyArn: 'local:v1',
        scope: 'https://www.googleapis.com/auth/drive.file',
        googleEmail: 'owner@example.com',
      });
      expect(rotated).toBeNull();
      const row = await pool!.query<{
        refresh_token_ciphertext: Buffer | null;
        deleted_at: Date | null;
      }>('select refresh_token_ciphertext, deleted_at from public.gdrive_accounts where id = $1', [
        id,
      ]);
      expect(row.rows[0]?.refresh_token_ciphertext).toBeNull();
      expect(row.rows[0]?.deleted_at).not.toBeNull();
    });
  });
});
