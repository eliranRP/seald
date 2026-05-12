import { StorageService } from '../../../storage/storage.service';
import {
  DriveFileNotFoundError,
  type DriveUploadedFile,
  type DriveUploader,
} from '../drive-uploader';
import { DriveUpstreamError, GdriveNotConnectedError } from '../dto/error-codes';
import { RateLimitedError } from '../rate-limiter';
import {
  type GdriveEnvelopeExport,
  type GdriveEnvelopeExportsRepository,
  type UpsertGdriveEnvelopeExportArgs,
} from '../gdrive-envelope-exports.repository';
import { GdriveExportService } from '../gdrive-export.service';
import type { GDriveService } from '../gdrive.service';
import type { GDriveAccount } from '../gdrive.repository';

function makeAccount(over: Partial<GDriveAccount> = {}): GDriveAccount {
  return {
    id: 'acc-1',
    userId: 'user-1',
    googleUserId: 'g-1',
    googleEmail: 'a@example.com',
    refreshTokenCiphertext: Buffer.alloc(0),
    refreshTokenKmsKeyArn: 'arn:stub',
    scope: 'https://www.googleapis.com/auth/drive.file',
    connectedAt: '2026-05-01T00:00:00.000Z',
    lastUsedAt: '2026-05-10T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

class FakeStorage extends StorageService {
  async upload(): Promise<void> {}
  async download(): Promise<Buffer> {
    return Buffer.from('%PDF-1.7 fake');
  }
  async remove(): Promise<void> {}
  async createSignedUrl(): Promise<string> {
    return 'https://example.invalid/signed';
  }
  async exists(): Promise<boolean> {
    return true;
  }
}

class FakeExportsRepo implements GdriveEnvelopeExportsRepository {
  rows: GdriveEnvelopeExport[] = [];
  upsertCalls: UpsertGdriveEnvelopeExportArgs[] = [];

  async findByEnvelopeAndAccount(
    envelopeId: string,
    accountId: string,
  ): Promise<GdriveEnvelopeExport | null> {
    return this.rows.find((r) => r.envelopeId === envelopeId && r.accountId === accountId) ?? null;
  }
  async findLatestByEnvelope(envelopeId: string): Promise<GdriveEnvelopeExport | null> {
    const matches = this.rows.filter((r) => r.envelopeId === envelopeId);
    return matches[matches.length - 1] ?? null;
  }
  async upsert(args: UpsertGdriveEnvelopeExportArgs): Promise<GdriveEnvelopeExport> {
    this.upsertCalls.push(args);
    const now = new Date().toISOString();
    const existing = await this.findByEnvelopeAndAccount(args.envelopeId, args.accountId);
    const row: GdriveEnvelopeExport = {
      id: existing?.id ?? `exp-${this.rows.length + 1}`,
      envelopeId: args.envelopeId,
      accountId: args.accountId,
      folderId: args.folderId,
      folderName: args.folderName,
      sealedFileId: args.sealedFileId,
      auditFileId: args.auditFileId,
      lastPushedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) {
      this.rows = this.rows.map((r) => (r.id === existing.id ? row : r));
    } else {
      this.rows.push(row);
    }
    return row;
  }
}

interface UploaderCall {
  readonly op: 'create' | 'update';
  readonly fileId?: string;
  readonly folderId?: string;
  readonly name?: string;
}

function makeUploader(
  behavior: {
    create?: (args: { name: string; folderId: string }) => DriveUploadedFile | Error;
    update?: (args: { fileId: string }) => DriveUploadedFile | Error;
  } = {},
): { uploader: DriveUploader; calls: UploaderCall[] } {
  const calls: UploaderCall[] = [];
  const uploader: DriveUploader = {
    async create({ metadata }): Promise<DriveUploadedFile> {
      const folderId = metadata.parents[0] ?? '';
      calls.push({ op: 'create', folderId, name: metadata.name });
      const out = behavior.create
        ? behavior.create({ name: metadata.name, folderId })
        : {
            id: `created-${calls.length}`,
            name: metadata.name,
            webViewLink: `link-${calls.length}`,
          };
      if (out instanceof Error) throw out;
      return out;
    },
    async update({ fileId }): Promise<DriveUploadedFile> {
      calls.push({ op: 'update', fileId });
      const out = behavior.update
        ? behavior.update({ fileId })
        : { id: fileId, name: `name-${fileId}`, webViewLink: `link-${fileId}` };
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { uploader, calls };
}

function makeGdriveService(
  over: {
    accounts?: GDriveAccount[];
    getAccessToken?: () => Promise<{ accessToken: string; expiresAt: number }>;
  } = {},
): GDriveService {
  const accounts = over.accounts ?? [makeAccount()];
  return {
    listAccounts: async () => accounts,
    getAccessToken:
      over.getAccessToken ??
      (async () => ({ accessToken: 'tok-abc', expiresAt: Date.now() + 3_600_000 })),
  } as unknown as GDriveService;
}

const ARTIFACTS = [
  { kind: 'sealed' as const, path: 'env-1/sealed.pdf', name: 'Deal (sealed).pdf' },
  { kind: 'audit' as const, path: 'env-1/audit.pdf', name: 'Deal (audit trail).pdf' },
];

describe('GdriveExportService', () => {
  it('happy path: creates two files in the chosen folder and records them', async () => {
    const exportsRepo = new FakeExportsRepo();
    const { uploader, calls } = makeUploader();
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );

    const result = await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-X',
      folderName: 'Clients/Acme',
      artifacts: ARTIFACTS,
    });

    expect(calls).toEqual([
      { op: 'create', folderId: 'folder-X', name: 'Deal (sealed).pdf' },
      { op: 'create', folderId: 'folder-X', name: 'Deal (audit trail).pdf' },
    ]);
    expect(result.files.map((f) => f.kind)).toEqual(['sealed', 'audit']);
    expect(result.folder).toEqual({
      id: 'folder-X',
      name: 'Clients/Acme',
      webViewLink: 'https://drive.google.com/drive/folders/folder-X',
    });
    expect(result.partialError).toBeUndefined();
    expect(exportsRepo.upsertCalls).toHaveLength(1);
    expect(exportsRepo.upsertCalls[0]).toMatchObject({
      envelopeId: 'env-1',
      accountId: 'acc-1',
      folderId: 'folder-X',
      sealedFileId: 'created-1',
      auditFileId: 'created-2',
    });
  });

  it('re-push into the SAME folder updates the recorded file ids', async () => {
    const exportsRepo = new FakeExportsRepo();
    exportsRepo.rows.push({
      id: 'exp-1',
      envelopeId: 'env-1',
      accountId: 'acc-1',
      folderId: 'folder-X',
      folderName: 'Clients/Acme',
      sealedFileId: 'sealed-old',
      auditFileId: 'audit-old',
      lastPushedAt: '2026-05-09T00:00:00.000Z',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
    const { uploader, calls } = makeUploader();
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );

    await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-X',
      folderName: 'Clients/Acme',
      artifacts: ARTIFACTS,
    });

    expect(calls).toEqual([
      { op: 'update', fileId: 'sealed-old' },
      { op: 'update', fileId: 'audit-old' },
    ]);
    expect(exportsRepo.upsertCalls[0]).toMatchObject({
      sealedFileId: 'sealed-old',
      auditFileId: 'audit-old',
    });
  });

  it('re-push into a DIFFERENT folder creates new files and updates the record', async () => {
    const exportsRepo = new FakeExportsRepo();
    exportsRepo.rows.push({
      id: 'exp-1',
      envelopeId: 'env-1',
      accountId: 'acc-1',
      folderId: 'folder-OLD',
      folderName: 'Old',
      sealedFileId: 'sealed-old',
      auditFileId: 'audit-old',
      lastPushedAt: '2026-05-09T00:00:00.000Z',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
    const { uploader, calls } = makeUploader();
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );

    await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-NEW',
      folderName: 'New',
      artifacts: ARTIFACTS,
    });

    expect(calls.map((c) => c.op)).toEqual(['create', 'create']);
    expect(exportsRepo.upsertCalls[0]).toMatchObject({
      folderId: 'folder-NEW',
      sealedFileId: 'created-1',
      auditFileId: 'created-2',
    });
  });

  it('falls back to create when update returns a Drive 404 (stale recorded id)', async () => {
    const exportsRepo = new FakeExportsRepo();
    exportsRepo.rows.push({
      id: 'exp-1',
      envelopeId: 'env-1',
      accountId: 'acc-1',
      folderId: 'folder-X',
      folderName: null,
      sealedFileId: 'sealed-stale',
      auditFileId: 'audit-stale',
      lastPushedAt: '2026-05-09T00:00:00.000Z',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
    const { uploader, calls } = makeUploader({
      update: ({ fileId }) =>
        fileId === 'sealed-stale'
          ? new DriveFileNotFoundError()
          : { id: fileId, name: `n-${fileId}`, webViewLink: `l-${fileId}` },
    });
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );

    await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-X',
      folderName: null,
      artifacts: ARTIFACTS,
    });

    // First artifact: update(404) → create. Second artifact: update succeeds.
    expect(calls).toEqual([
      { op: 'update', fileId: 'sealed-stale' },
      { op: 'create', folderId: 'folder-X', name: 'Deal (sealed).pdf' },
      { op: 'update', fileId: 'audit-stale' },
    ]);
  });

  it('throws GdriveNotConnectedError when the user has no connected account', async () => {
    const svc = new GdriveExportService(
      makeGdriveService({ accounts: [] }),
      new FakeStorage(),
      makeUploader().uploader,
      new FakeExportsRepo(),
    );
    await expect(
      svc.exportEnvelope({
        userId: 'user-1',
        envelopeId: 'env-1',
        folderId: 'folder-X',
        folderName: null,
        artifacts: ARTIFACTS,
      }),
    ).rejects.toBeInstanceOf(GdriveNotConnectedError);
  });

  it('ignores soft-deleted accounts and picks the most-recently-used live one', async () => {
    const exportsRepo = new FakeExportsRepo();
    const { uploader } = makeUploader();
    const svc = new GdriveExportService(
      makeGdriveService({
        accounts: [
          makeAccount({ id: 'dead', deletedAt: '2026-05-11T00:00:00.000Z' }),
          makeAccount({ id: 'stale', lastUsedAt: '2026-05-01T00:00:00.000Z' }),
          makeAccount({ id: 'fresh', lastUsedAt: '2026-05-10T00:00:00.000Z' }),
        ],
      }),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );
    await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-X',
      folderName: null,
      artifacts: ARTIFACTS,
    });
    expect(exportsRepo.upsertCalls[0]?.accountId).toBe('fresh');
  });

  it('propagates a rate-limit error raised mid-upload', async () => {
    const { uploader } = makeUploader({
      create: () => new RateLimitedError(30_000),
    });
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      new FakeExportsRepo(),
    );
    await expect(
      svc.exportEnvelope({
        userId: 'user-1',
        envelopeId: 'env-1',
        folderId: 'folder-X',
        folderName: null,
        artifacts: ARTIFACTS,
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('first-file failure throws and does not touch the record', async () => {
    const exportsRepo = new FakeExportsRepo();
    const { uploader } = makeUploader({
      create: ({ name }) =>
        name.includes('sealed')
          ? new DriveUpstreamError('boom')
          : { id: 'x', name, webViewLink: 'l' },
    });
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );
    await expect(
      svc.exportEnvelope({
        userId: 'user-1',
        envelopeId: 'env-1',
        folderId: 'folder-X',
        folderName: null,
        artifacts: ARTIFACTS,
      }),
    ).rejects.toBeInstanceOf(DriveUpstreamError);
    expect(exportsRepo.upsertCalls).toHaveLength(0);
  });

  it('second-file failure returns a partial result and still records the first id', async () => {
    const exportsRepo = new FakeExportsRepo();
    const { uploader } = makeUploader({
      create: ({ name }) =>
        name.includes('audit')
          ? new DriveUpstreamError('boom')
          : { id: 'sealed-ok', name, webViewLink: 'l-sealed' },
    });
    const svc = new GdriveExportService(
      makeGdriveService(),
      new FakeStorage(),
      uploader,
      exportsRepo,
    );
    const result = await svc.exportEnvelope({
      userId: 'user-1',
      envelopeId: 'env-1',
      folderId: 'folder-X',
      folderName: null,
      artifacts: ARTIFACTS,
    });
    expect(result.files.map((f) => f.kind)).toEqual(['sealed']);
    expect(result.partialError).toEqual({ kind: 'audit', code: 'drive-upstream-error' });
    expect(exportsRepo.upsertCalls[0]).toMatchObject({
      sealedFileId: 'sealed-ok',
      auditFileId: null,
    });
  });
});
