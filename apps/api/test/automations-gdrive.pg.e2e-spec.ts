import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { GdriveUploadActionExecutor } from '../src/automations/actions/gdrive/gdrive-upload.executor';
import { GdriveUploadPgRepository } from '../src/automations/actions/gdrive/gdrive-upload.repository.pg';
import { AutomationWorkerService } from '../src/automations/automation-worker.service';
import { AutomationsPgRepository } from '../src/automations/automations.repository.pg';
import { AutomationMatcherService } from '../src/automations/matcher';
import type { AppEnv } from '../src/config/env.schema';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import type {
  DriveFolderOps,
  DriveUploadedFile,
  DriveUploader,
} from '../src/integrations/gdrive/drive-uploader';
import { DriveUpstreamError, TokenExpiredError } from '../src/integrations/gdrive/dto/error-codes';
import type { GdriveExportService } from '../src/integrations/gdrive/gdrive-export.service';
import { GDriveRateLimiter } from '../src/integrations/gdrive/rate-limiter';
import { StorageService } from '../src/storage/storage.service';

/**
 * WP-32 (automations A6) against real Postgres, in a scratch database of
 * its own: sealed event -> matcher -> worker -> `gdrive_upload` executor
 * with the real Postgres repository and an in-memory Drive. Covers the
 * default folder being remembered on the recipe, multi-document uploads,
 * a transient failure followed by an idempotent retry, and a revoked token.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `automations_gdrive_${randomBytes(4).toString('hex')}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the gdrive automation spec');
}

const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const ENV = {
  NODE_ENV: 'test',
  PORT: 3000,
  WORKER_ENABLED: false,
  AUTOMATIONS_DISABLED: false,
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  GDRIVE_CONVERSION_MAX_BYTES: 1000,
} as AppEnv;

class MemoryStorage extends StorageService {
  async upload(): Promise<void> {}
  async download(path: string): Promise<Buffer> {
    return Buffer.from(`bytes:${path}`);
  }
  async remove(): Promise<void> {}
  async createSignedUrl(): Promise<string> {
    return 'https://example.invalid/signed';
  }
  async exists(): Promise<boolean> {
    return true;
  }
}

class MemoryDrive implements DriveUploader, DriveFolderOps {
  readonly files: { id: string; parent: string; name: string; folder: boolean }[] = [];
  failNextCreate: Error | null = null;
  private seq = 0;
  async findFileByName(args: {
    name: string;
    parentId: string;
    folder?: boolean;
  }): Promise<DriveUploadedFile | null> {
    const f = this.files.find(
      (x) =>
        x.name === args.name && x.parent === args.parentId && x.folder === (args.folder === true),
    );
    return f ? { id: f.id, name: f.name, webViewLink: 'x' } : null;
  }
  async createFolder(args: { name: string; parentId?: string }): Promise<DriveUploadedFile> {
    this.seq += 1;
    const id = `Folder${this.seq}xx`;
    this.files.push({ id, parent: args.parentId ?? 'root', name: args.name, folder: true });
    return { id, name: args.name, webViewLink: 'x' };
  }
  async create(args: {
    metadata: { name: string; parents: ReadonlyArray<string> };
  }): Promise<DriveUploadedFile> {
    if (this.failNextCreate) {
      const err = this.failNextCreate;
      this.failNextCreate = null;
      throw err;
    }
    this.seq += 1;
    const id = `File${this.seq}xxxx`;
    this.files.push({
      id,
      parent: args.metadata.parents[0] ?? 'root',
      name: args.metadata.name,
      folder: false,
    });
    return { id, name: args.metadata.name, webViewLink: 'x' };
  }
  async update(args: { fileId: string }): Promise<DriveUploadedFile> {
    return { id: args.fileId, name: 'x', webViewLink: 'x' };
  }
  uploaded(): string[] {
    return this.files.filter((f) => !f.folder).map((f) => f.name);
  }
}

describePg('automation Drive save (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: AutomationsPgRepository;
  let envelopes: EnvelopesPgRepository;
  let worker: AutomationWorkerService;
  let drive: MemoryDrive;
  let sessionError: Error | null;
  let ownerId: string;
  let codeCounter = 0;

  async function migrate(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 10 });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrate();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new AutomationsPgRepository(db);
    const matcher = new AutomationMatcherService(repo, ENV);
    envelopes = new EnvelopesPgRepository(db, matcher);
    drive = new MemoryDrive();
    const exporter = {
      openSession: async () => {
        if (sessionError) throw sessionError;
        return { accountId: 'acc-1', accessToken: 'tok' };
      },
    } as unknown as GdriveExportService;
    const executor = new GdriveUploadActionExecutor(
      new GdriveUploadPgRepository(db),
      exporter,
      new MemoryStorage(),
      new GDriveRateLimiter({ capacity: 1000, windowMs: 60_000 }),
      drive,
      ENV,
    );
    worker = new AutomationWorkerService(repo, ENV, { gdrive_upload: executor });
  }, 180_000);

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true, gdriveIntegration: true };
    ownerId = randomUUID();
    sessionError = null;
    drive.files.length = 0;
    await pool!.query('insert into auth.users (id) values ($1)', [ownerId]);
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function seedSealedEnvelope(documents: number): Promise<string> {
    codeCounter += 1;
    const e = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: `GD${String(codeCounter).padStart(11, '0')}`,
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await pool!.query(
      `update public.envelopes set original_file_path = $2, original_sha256 = repeat('a', 64),
         original_pages = 1, sealed_file_path = $3, sealed_sha256 = repeat('b', 64),
         audit_file_path = $4 where id = $1`,
      [e.id, `${e.id}/original.pdf`, `${e.id}/sealed.pdf`, `${e.id}/audit.pdf`],
    );
    for (let ord = 2; ord <= documents; ord += 1) {
      await pool!.query(
        `insert into public.envelope_documents
           (envelope_id, ord, title, original_file_path, original_sha256, original_pages,
            sealed_file_path, sealed_sha256)
         values ($1, $2, $3, $4, repeat('c', 64), 1, $5, repeat('d', 64))`,
        [
          e.id,
          ord,
          `Exhibit ${ord}`,
          `${e.id}/documents/d${ord}/original.pdf`,
          `${e.id}/documents/d${ord}/sealed.pdf`,
        ],
      );
    }
    return e.id;
  }

  async function addRecipe(config: Record<string, unknown> = {}): Promise<string> {
    const res = await pool!.query<{ id: string }>(
      `insert into public.automations (owner_id, recipe, name, enabled, trigger, action, config)
       values ($1, 'sealed_save_drive', 'Save to Drive', true, 'envelope_sealed', 'gdrive_upload', $2)
       returning id`,
      [
        ownerId,
        JSON.stringify({ folder_id: null, folder_name: null, account_id: null, ...config }),
      ],
    );
    return res.rows[0]!.id;
  }

  async function seal(envelopeId: string, automationId: string): Promise<void> {
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    for (let i = 0; i < 100; i += 1) {
      const r = await pool!.query('select 1 from automation_jobs where automation_id = $1', [
        automationId,
      ]);
      if (r.rowCount) return;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    throw new Error('matcher did not enqueue a job');
  }

  async function run(automationId: string): Promise<{
    status: string;
    retryable: boolean;
    last_error: string | null;
  }> {
    const r = await pool!.query(
      'select status, retryable, last_error from automation_runs where automation_id = $1',
      [automationId],
    );
    return r.rows[0];
  }

  it('creates and remembers the default folder, then uploads every sealed PDF and audit.pdf', async () => {
    const automationId = await addRecipe();
    const envelopeId = await seedSealedEnvelope(2);
    await seal(envelopeId, automationId);

    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 1, retrying: 0, failed: 0 });
    expect(await run(automationId)).toMatchObject({ status: 'done', last_error: null });
    const cfg = await pool!.query<{ config: Record<string, unknown> }>(
      'select config from automations where id = $1',
      [automationId],
    );
    expect(cfg.rows[0]!.config).toMatchObject({
      folder_id: 'Folder1xx',
      folder_name: 'My Drive / Seald',
      account_id: null,
    });
    expect(drive.uploaded()).toHaveLength(3);
    expect(drive.uploaded().some((n) => n.includes('(audit trail)'))).toBe(true);
    expect(drive.files.filter((f) => f.folder)).toHaveLength(1);
  });

  it('retries a transient failure without duplicating what already landed', async () => {
    const automationId = await addRecipe();
    const envelopeId = await seedSealedEnvelope(1);
    await seal(envelopeId, automationId);

    // The second create (audit) fails once: the first file is already in Drive.
    const realCreate = drive.create.bind(drive);
    let creates = 0;
    drive.create = async (args) => {
      creates += 1;
      if (creates === 2) throw new DriveUpstreamError('drive_create_503');
      return realCreate(args);
    };
    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 0, retrying: 1, failed: 0 });
    expect(await run(automationId)).toMatchObject({
      status: 'retrying',
      last_error: 'drive_upload_failed',
    });
    expect(drive.uploaded()).toHaveLength(1);

    await pool!.query(
      `update automation_jobs set scheduled_for = now() - interval '1 second' where automation_id = $1`,
      [automationId],
    );
    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 1, retrying: 0, failed: 0 });
    expect(await run(automationId)).toMatchObject({ status: 'done' });
    expect(drive.uploaded()).toHaveLength(2);
    expect(new Set(drive.uploaded()).size).toBe(2);
    expect(drive.files.filter((f) => f.folder)).toHaveLength(1);
  });

  it('a revoked token fails the run for good with reconnect_required', async () => {
    const automationId = await addRecipe();
    const envelopeId = await seedSealedEnvelope(1);
    sessionError = new TokenExpiredError();
    await seal(envelopeId, automationId);
    expect(await worker.flushOnce(10)).toEqual({ claimed: 1, done: 0, retrying: 0, failed: 1 });
    expect(await run(automationId)).toMatchObject({
      status: 'failed',
      retryable: false,
      last_error: 'reconnect_required',
    });
    expect(drive.files).toHaveLength(0);
  });
});
