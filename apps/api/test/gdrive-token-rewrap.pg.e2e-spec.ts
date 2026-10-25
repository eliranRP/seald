import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import {
  GDriveKmsService,
  type KmsClientPort,
} from '../src/integrations/gdrive/gdrive-kms.service';
import {
  LOCAL_WRAP_KEY_ID,
  LocalWrapKmsClient,
} from '../src/integrations/gdrive/local-wrap-kms-client';
import { rewrapGdriveTokens } from '../src/integrations/gdrive/rewrap-tokens';

/**
 * The Drive token re-wrap (AWS exit plan, WS-3) against real Postgres: the
 * tokens are bytea, which pg-mem does not round-trip. Same harness as
 * gdrive-token-erasure.pg.e2e-spec.ts: its own database on the server in
 * SUBMIT_SIGNER_DATABASE_URL, migrated by migrate.sh; skipped without it,
 * required in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `gdrive_rewrap_${randomBytes(4).toString('hex')}`;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the Drive token re-wrap spec');
}

const describePg = databaseUrl ? describe : describe.skip;

/** Stands in for AWS KMS: "wraps" a data key by prefixing the key id. */
class FakeAwsKms implements KmsClientPort {
  async generateDataKey(keyId: string) {
    const plaintext = randomBytes(32);
    return {
      plaintext: Buffer.from(plaintext),
      ciphertextBlob: Buffer.concat([Buffer.from(`${keyId}|`), plaintext]),
    };
  }
  async decrypt(blob: Buffer) {
    // A view into `blob`, on purpose: decrypt() zeroes what it gets back,
    // and the re-wrap must still match the stored ciphertext.
    return blob.subarray(blob.indexOf(0x7c) + 1);
  }
}

const AWS_ARN = 'arn:aws:kms:us-east-1:000000000000:key/legacy';

describePg('rewrapGdriveTokens (AWS exit plan, WS-3, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  let userId: string;
  const aws = new FakeAwsKms();
  const legacy = new GDriveKmsService(aws, AWS_ARN);
  const wrapKey = randomBytes(32);
  const dual = new GDriveKmsService(new LocalWrapKmsClient(wrapKey), LOCAL_WRAP_KEY_ID, {
    client: aws,
    keyArn: AWS_ARN,
  });

  async function insert(token: string | null, svc: GDriveKmsService = legacy): Promise<string> {
    const enc = token === null ? null : await svc.encrypt(token);
    const row = await db
      .insertInto('gdrive_accounts')
      .values({
        user_id: userId,
        google_user_id: `g-${Math.random()}`,
        google_email: 'a@example.com',
        refresh_token_ciphertext: enc?.ciphertext ?? null,
        refresh_token_kms_key_arn: enc?.kmsKeyArn ?? null,
        scope: 'drive.file',
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function stored(id: string) {
    return db
      .selectFrom('gdrive_accounts')
      .select(['refresh_token_ciphertext', 'refresh_token_kms_key_arn'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
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
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: {
        ...process.env,
        DATABASE_URL: dedicated.toString(),
        MIGRATIONS_DIR: resolve(__dirname, '../db/migrations'),
      },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }, 180_000);

  beforeEach(async () => {
    await pool!.query('delete from public.gdrive_accounts');
    userId = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [userId]);
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('moves KMS-wrapped tokens to the local key and they still decrypt to the same token', async () => {
    const a = await insert('1//token-a');
    const b = await insert('1//token-b');
    const result = await rewrapGdriveTokens(db, dual);
    expect(result).toEqual({ scanned: 2, rewrapped: 2, failed: [], raced: 0 });
    for (const [id, token] of [
      [a, '1//token-a'],
      [b, '1//token-b'],
    ] as const) {
      const row = await stored(id);
      expect(row.refresh_token_kms_key_arn).toBe(LOCAL_WRAP_KEY_ID);
      // Readable with the wrap key alone: the KMS key can be retired.
      const localOnly = new GDriveKmsService(new LocalWrapKmsClient(wrapKey), LOCAL_WRAP_KEY_ID);
      await expect(
        localOnly.decrypt(row.refresh_token_ciphertext as Buffer, LOCAL_WRAP_KEY_ID),
      ).resolves.toBe(token);
    }
  });

  it('skips rows already on the local key and disconnected rows, and is safe to re-run', async () => {
    await insert('1//already-local', dual);
    await insert(null);
    await insert('1//legacy');
    expect((await rewrapGdriveTokens(db, dual)).rewrapped).toBe(1);
    expect(await rewrapGdriveTokens(db, dual)).toEqual({
      scanned: 0,
      rewrapped: 0,
      failed: [],
      raced: 0,
    });
  });

  it('dry run decrypts every row but writes nothing', async () => {
    const id = await insert('1//legacy');
    const before = await stored(id);
    expect(await rewrapGdriveTokens(db, dual, { dryRun: true })).toEqual({
      scanned: 1,
      rewrapped: 0,
      failed: [],
      raced: 0,
    });
    expect((await stored(id)).refresh_token_kms_key_arn).toBe(before.refresh_token_kms_key_arn);
  });

  it('reports rows the configured keys cannot decrypt and leaves them alone', async () => {
    const id = await insert('1//legacy');
    const noAws = new GDriveKmsService(new LocalWrapKmsClient(wrapKey), LOCAL_WRAP_KEY_ID);
    const result = await rewrapGdriveTokens(db, noAws);
    expect(result.failed).toEqual([id]);
    expect((await stored(id)).refresh_token_kms_key_arn).toBe(AWS_ARN);
  });
});
