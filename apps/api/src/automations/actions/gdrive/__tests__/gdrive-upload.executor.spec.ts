import { Logger } from '@nestjs/common';
import { AUTOMATION_MAX_ATTEMPTS } from 'shared';
import type { AppEnv } from '../../../../config/env.schema';
import {
  DriveFileNotFoundError,
  type DriveFolderOps,
  type DriveUploadedFile,
  type DriveUploader,
} from '../../../../integrations/gdrive/drive-uploader';
import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../../../../integrations/gdrive/dto/error-codes';
import type { GdriveExportService } from '../../../../integrations/gdrive/gdrive-export.service';
import { GDriveRateLimiter, RateLimitedError } from '../../../../integrations/gdrive/rate-limiter';
import { StorageService } from '../../../../storage/storage.service';
import type { ClaimedAutomationJob } from '../../../automations.repository.pg';
import { buildUploadPlan, parseGdriveUploadConfig } from '../gdrive-upload.config';
import { GdriveUploadActionExecutor } from '../gdrive-upload.executor';
import { GdriveUploadRepository, type GdriveUploadContext } from '../gdrive-upload.repository';

const ENV_ID = '9f8e7d6c-1111-4222-8333-444455556666';
const TAG = '9f8e7d6c';

function job(overrides: Partial<ClaimedAutomationJob> = {}): ClaimedAutomationJob {
  return {
    job_id: 'job-1',
    run_id: 'run-1',
    automation_id: 'auto-1',
    attempts: 1,
    max_attempts: AUTOMATION_MAX_ATTEMPTS,
    owner_id: 'owner-1',
    envelope_id: ENV_ID,
    event_id: 'evt-1',
    signer_id: null,
    trigger: 'envelope_sealed',
    action: 'gdrive_upload',
    config: { folder_id: null, folder_name: null, account_id: null },
    ...overrides,
  };
}

class FakeRepo extends GdriveUploadRepository {
  context: GdriveUploadContext | null = {
    envelope: {
      id: ENV_ID,
      title: 'Lease',
      status: 'completed',
      auditPath: `${ENV_ID}/audit.pdf`,
      sealedPath: `${ENV_ID}/sealed.pdf`,
    },
    documents: [{ ord: 1, title: 'Lease', sealedPath: `${ENV_ID}/sealed.pdf` }],
  };
  remembered: { automationId: string; folderId: string; folderName: string }[] = [];
  async loadContext(): Promise<GdriveUploadContext | null> {
    return this.context;
  }
  async rememberFolder(input: {
    automationId: string;
    folderId: string;
    folderName: string;
  }): Promise<string> {
    this.remembered.push(input);
    return input.folderId;
  }
}

class FakeStorage extends StorageService {
  readonly downloads: string[] = [];
  oversize = false;
  async upload(): Promise<void> {}
  async download(path: string): Promise<Buffer> {
    this.downloads.push(path);
    return this.oversize ? Buffer.alloc(101) : Buffer.from(`bytes:${path}`);
  }
  async remove(): Promise<void> {}
  async createSignedUrl(): Promise<string> {
    return 'https://example.invalid/signed';
  }
  async exists(): Promise<boolean> {
    return true;
  }
}

/** In-memory Drive: files keyed by (parent, name), so lookups behave like `files.list`. */
class FakeDrive implements DriveUploader, DriveFolderOps {
  readonly files = new Map<string, { id: string; parent: string; name: string; bytes: Buffer }>();
  readonly calls: string[] = [];
  /** Throw this on the n-th create (1-based). */
  failCreateAt: { n: number; err: Error } | null = null;
  failFind: Error | null = null;
  failUpdate: Error | null = null;
  failCreateFolder: Error | null = null;
  private creates = 0;
  private seq = 0;

  private next(prefix: string): string {
    this.seq += 1;
    return `${prefix}${String(this.seq).padStart(6, '0')}`;
  }

  async findFileByName(args: {
    name: string;
    parentId: string;
    folder?: boolean;
  }): Promise<DriveUploadedFile | null> {
    this.calls.push(`find:${args.name}`);
    if (this.failFind) throw this.failFind;
    for (const f of this.files.values()) {
      if (f.parent === args.parentId && f.name === args.name) {
        return { id: f.id, name: f.name, webViewLink: 'x' };
      }
    }
    return null;
  }

  async createFolder(args: { name: string; parentId?: string }): Promise<DriveUploadedFile> {
    this.calls.push(`folder:${args.name}`);
    if (this.failCreateFolder) throw this.failCreateFolder;
    const id = this.next('folder');
    this.files.set(id, {
      id,
      parent: args.parentId ?? 'root',
      name: args.name,
      bytes: Buffer.alloc(0),
    });
    return { id, name: args.name, webViewLink: 'x' };
  }

  async create(args: {
    metadata: { name: string; parents: ReadonlyArray<string> };
    bytes: Buffer;
  }): Promise<DriveUploadedFile> {
    this.creates += 1;
    this.calls.push(`create:${args.metadata.name}`);
    if (this.failCreateAt && this.failCreateAt.n === this.creates) throw this.failCreateAt.err;
    const id = this.next('file');
    this.files.set(id, {
      id,
      parent: args.metadata.parents[0] ?? 'root',
      name: args.metadata.name,
      bytes: args.bytes,
    });
    return { id, name: args.metadata.name, webViewLink: 'x' };
  }

  async update(args: { fileId: string; bytes: Buffer }): Promise<DriveUploadedFile> {
    this.calls.push(`update:${args.fileId}`);
    if (this.failUpdate) throw this.failUpdate;
    const f = this.files.get(args.fileId);
    if (!f) throw new DriveFileNotFoundError();
    f.bytes = args.bytes;
    return { id: f.id, name: f.name, webViewLink: 'x' };
  }

  uploadedNames(): string[] {
    return [...this.files.values()].filter((f) => f.bytes.length > 0).map((f) => f.name);
  }
}

interface World {
  readonly exec: GdriveUploadActionExecutor;
  readonly repo: FakeRepo;
  readonly drive: FakeDrive;
  readonly storage: FakeStorage;
  readonly session: { fn: jest.Mock };
}

function world(opts: { capacity?: number } = {}): World {
  const repo = new FakeRepo();
  const drive = new FakeDrive();
  const storage = new FakeStorage();
  const session = {
    fn: jest.fn(async () => ({ accountId: 'acc-1', accessToken: 'tok' })),
  };
  const exporter = { openSession: session.fn } as unknown as GdriveExportService;
  const limiter = new GDriveRateLimiter({ capacity: opts.capacity ?? 1000, windowMs: 60_000 });
  const exec = new GdriveUploadActionExecutor(repo, exporter, storage, limiter, drive, {
    GDRIVE_CONVERSION_MAX_BYTES: 100,
  } as AppEnv);
  return { exec, repo, drive, storage, session };
}

describe('gdrive_upload executor', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates "My Drive / Seald", remembers it, and uploads the sealed PDF and audit.pdf', async () => {
    const w = world();
    expect(await w.exec.execute(job())).toEqual({ kind: 'done' });
    expect(w.drive.calls.filter((c) => c.startsWith('folder:'))).toEqual(['folder:Seald']);
    expect(w.repo.remembered).toEqual([
      {
        ownerId: 'owner-1',
        automationId: 'auto-1',
        folderId: 'folder000001',
        folderName: 'My Drive / Seald',
      },
    ]);
    expect(w.drive.uploadedNames().sort()).toEqual([
      `Lease (audit trail) [${TAG}].pdf`,
      `Lease (sealed) [${TAG}].pdf`,
    ]);
    for (const f of w.drive.files.values()) {
      if (f.bytes.length > 0) expect(f.parent).toBe('folder000001');
    }
  });

  it('reuses an existing app-created Seald folder instead of creating another', async () => {
    const w = world();
    await w.drive.createFolder({ name: 'Seald' });
    w.drive.calls.length = 0;
    expect((await w.exec.execute(job())).kind).toBe('done');
    expect(w.drive.calls.some((c) => c.startsWith('folder:'))).toBe(false);
    expect(w.repo.remembered[0]?.folderId).toBe('folder000001');
  });

  it('uses a stored folder id without any folder lookup or write to the recipe', async () => {
    const w = world();
    const out = await w.exec.execute(
      job({ config: { folder_id: 'PickedFolder123', folder_name: 'Contracts', account_id: null } }),
    );
    expect(out.kind).toBe('done');
    expect(w.repo.remembered).toEqual([]);
    expect(w.drive.calls.some((c) => c.startsWith('folder:'))).toBe(false);
    expect([...w.drive.files.values()].every((f) => f.parent === 'PickedFolder123')).toBe(true);
  });

  it('passes the recipe account to the shared Drive session', async () => {
    const w = world();
    const account = '11111111-2222-4333-8444-555555555555';
    await w.exec.execute(
      job({ config: { folder_id: null, folder_name: null, account_id: account } }),
    );
    expect(w.session.fn).toHaveBeenCalledWith('owner-1', account);
  });

  it('uploads one sealed PDF per document plus audit.pdf', async () => {
    const w = world();
    w.repo.context = {
      envelope: {
        id: ENV_ID,
        title: 'Deal: A/B',
        status: 'completed',
        auditPath: `${ENV_ID}/audit.pdf`,
        sealedPath: `${ENV_ID}/sealed.pdf`,
      },
      documents: [
        { ord: 1, title: 'NDA', sealedPath: `${ENV_ID}/sealed.pdf` },
        { ord: 2, title: 'Order form', sealedPath: `${ENV_ID}/documents/d2/sealed.pdf` },
        { ord: 3, title: 'Exhibit', sealedPath: `${ENV_ID}/documents/d3/sealed.pdf` },
      ],
    };
    expect((await w.exec.execute(job())).kind).toBe('done');
    expect(w.storage.downloads).toEqual([
      `${ENV_ID}/sealed.pdf`,
      `${ENV_ID}/documents/d2/sealed.pdf`,
      `${ENV_ID}/documents/d3/sealed.pdf`,
      `${ENV_ID}/audit.pdf`,
    ]);
    expect(w.drive.uploadedNames()).toEqual([
      `Deal A B - NDA (sealed) [${TAG}-1].pdf`,
      `Deal A B - Order form (sealed) [${TAG}-2].pdf`,
      `Deal A B - Exhibit (sealed) [${TAG}-3].pdf`,
      `Deal A B (audit trail) [${TAG}].pdf`,
    ]);
  });

  it('falls back to the envelope row for a legacy envelope without document rows', async () => {
    const w = world();
    w.repo.context = { ...w.repo.context!, documents: [] };
    expect((await w.exec.execute(job())).kind).toBe('done');
    expect(w.drive.uploadedNames()).toHaveLength(2);
  });

  describe('idempotency', () => {
    it('a re-run updates the files in place and makes no duplicates', async () => {
      const w = world();
      await w.exec.execute(job());
      const first = [...w.drive.files.keys()];
      const stored = { folder_id: 'folder000001', folder_name: null, account_id: null };
      expect((await w.exec.execute(job({ config: stored }))).kind).toBe('done');
      expect([...w.drive.files.keys()]).toEqual(first);
      expect(w.drive.calls.filter((c) => c.startsWith('update:'))).toHaveLength(2);
      expect(w.drive.uploadedNames()).toHaveLength(2);
    });

    it('a retry after a partial upload only creates the file that is missing', async () => {
      const w = world();
      w.drive.failCreateAt = { n: 2, err: new DriveUpstreamError('drive_create_503') };
      const first = await w.exec.execute(job());
      expect(first).toEqual({ kind: 'transient', slug: 'drive_upload_failed' });
      expect(w.drive.uploadedNames()).toEqual([`Lease (sealed) [${TAG}].pdf`]);
      w.drive.failCreateAt = null;
      const stored = { folder_id: 'folder000001', folder_name: null, account_id: null };
      expect((await w.exec.execute(job({ config: stored, attempts: 2 }))).kind).toBe('done');
      expect(w.drive.uploadedNames().sort()).toEqual([
        `Lease (audit trail) [${TAG}].pdf`,
        `Lease (sealed) [${TAG}].pdf`,
      ]);
    });

    it('creates a fresh file when the found one was trashed before the update', async () => {
      const w = world();
      await w.exec.execute(job());
      w.drive.failUpdate = new DriveFileNotFoundError();
      const stored = { folder_id: 'folder000001', folder_name: null, account_id: null };
      expect((await w.exec.execute(job({ config: stored }))).kind).toBe('done');
    });
  });

  describe('failure classes', () => {
    it('no Drive connected is permanent gdrive_not_connected', async () => {
      const w = world();
      w.session.fn.mockRejectedValueOnce(new GdriveNotConnectedError());
      expect(await w.exec.execute(job())).toEqual({
        kind: 'permanent',
        slug: 'gdrive_not_connected',
      });
      expect(w.drive.calls).toEqual([]);
    });

    it('a revoked token is permanent reconnect_required', async () => {
      const w = world();
      w.session.fn.mockRejectedValueOnce(new TokenExpiredError());
      expect(await w.exec.execute(job())).toEqual({
        kind: 'permanent',
        slug: 'reconnect_required',
      });
    });

    it('a 401 from an upload is permanent reconnect_required', async () => {
      const w = world();
      w.drive.failFind = new TokenExpiredError('drive_list_401');
      expect(await w.exec.execute(job())).toEqual({
        kind: 'permanent',
        slug: 'reconnect_required',
      });
    });

    it('a folder the app cannot write is permanent permission-denied', async () => {
      const w = world();
      w.drive.failCreateAt = { n: 1, err: new DrivePermissionDeniedError() };
      expect(await w.exec.execute(job({ config: { folder_id: 'PickedFolder123' } }))).toEqual({
        kind: 'permanent',
        slug: 'permission-denied',
      });
    });

    it('a deleted folder is permanent folder_not_found', async () => {
      const w = world();
      w.drive.failCreateAt = { n: 1, err: new DriveFileNotFoundError() };
      expect(await w.exec.execute(job({ config: { folder_id: 'PickedFolder123' } }))).toEqual({
        kind: 'permanent',
        slug: 'folder_not_found',
      });
    });

    it('a Drive rate limit is transient and carries retryAfterMs', async () => {
      const w = world();
      w.drive.failFind = new RateLimitedError(30_000);
      expect(await w.exec.execute(job())).toEqual({
        kind: 'transient',
        slug: 'rate_limited',
        retryAfterMs: 30_000,
      });
    });

    it('the shared per-user token bucket running dry is transient too', async () => {
      const w = world({ capacity: 2 });
      const out = await w.exec.execute(job());
      expect(out).toMatchObject({ kind: 'transient', slug: 'rate_limited' });
    });

    it('a Drive 5xx is transient', async () => {
      const w = world();
      w.drive.failCreateFolder = new DriveUpstreamError('drive_folder_503');
      expect(await w.exec.execute(job())).toEqual({
        kind: 'transient',
        slug: 'drive_upload_failed',
      });
      expect(w.repo.remembered).toEqual([]);
    });

    it('never leaks the upstream message into the slug', async () => {
      const w = world();
      w.drive.failFind = new DriveUpstreamError('Bearer ya29.secret-token body');
      const out = await w.exec.execute(job());
      expect(JSON.stringify(out)).not.toContain('ya29');
    });

    it('an unsealed envelope is permanent envelope_not_sealed', async () => {
      const w = world();
      w.repo.context = {
        ...w.repo.context!,
        envelope: { ...w.repo.context!.envelope, auditPath: null },
      };
      expect(await w.exec.execute(job())).toEqual({
        kind: 'permanent',
        slug: 'envelope_not_sealed',
      });
    });

    it('a document without a sealed artifact is permanent envelope_not_sealed', async () => {
      const w = world();
      w.repo.context = {
        ...w.repo.context!,
        documents: [
          { ord: 1, title: 'A', sealedPath: 'a' },
          { ord: 2, title: 'B', sealedPath: null },
        ],
      };
      expect((await w.exec.execute(job())) as { slug: string }).toMatchObject({
        slug: 'envelope_not_sealed',
      });
    });

    it('a missing envelope, bad config and an oversize PDF are permanent', async () => {
      const w = world();
      w.repo.context = null;
      expect(await w.exec.execute(job())).toEqual({ kind: 'permanent', slug: 'envelope_missing' });
      expect(await w.exec.execute(job({ envelope_id: null }))).toEqual({
        kind: 'permanent',
        slug: 'envelope_missing',
      });
      expect(await w.exec.execute(job({ config: { folder_id: "x' or '1'='1" } }))).toEqual({
        kind: 'permanent',
        slug: 'bad_config',
      });
      const big = world();
      big.storage.oversize = true;
      expect(await big.exec.execute(job({ config: { folder_id: 'PickedFolder123' } }))).toEqual({
        kind: 'permanent',
        slug: 'file_too_large',
      });
    });

    it('is permanent gdrive_disabled while the gdriveIntegration flag is off', async () => {
      const host = globalThis as unknown as {
        __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
      };
      host.__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: false };
      try {
        const w = world();
        expect(await w.exec.execute(job())).toEqual({
          kind: 'permanent',
          slug: 'gdrive_disabled',
        });
        expect(w.session.fn).not.toHaveBeenCalled();
      } finally {
        delete host.__SEALD_FEATURE_OVERRIDES__;
      }
    });
  });
});

describe('gdrive_upload config + plan', () => {
  it('parses nulls, rejects malformed ids', () => {
    expect(parseGdriveUploadConfig({})).toEqual({
      ok: true,
      folderId: null,
      folderName: null,
      accountId: null,
    });
    expect(parseGdriveUploadConfig({ account_id: 'nope' })).toEqual({
      ok: false,
      slug: 'bad_config',
    });
    expect(parseGdriveUploadConfig({ folder_name: 5 })).toEqual({ ok: false, slug: 'bad_config' });
  });

  it('names are deterministic and unique per envelope', () => {
    const input = {
      envelopeId: ENV_ID,
      title: '  ',
      documents: [{ ord: 1, title: 'x', sealedPath: 'p' }],
      auditPath: 'a',
    };
    expect(buildUploadPlan(input)).toEqual(buildUploadPlan(input));
    expect(buildUploadPlan(input)[0]?.name).toBe(`Envelope (sealed) [${TAG}].pdf`);
    const other = buildUploadPlan({ ...input, envelopeId: 'aaaaaaaa-0000-4000-8000-000000000000' });
    expect(other[0]?.name).not.toBe(buildUploadPlan(input)[0]?.name);
  });
});
