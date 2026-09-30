import { Inject, Injectable } from '@nestjs/common';
import { GDriveService } from './gdrive.service';
import { GDriveRateLimiter } from './rate-limiter';

/**
 * Drive `files.list` metadata the proxy returns. The SPA picker mirrors
 * this shape; keep the field names stable.
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export type DriveMimeFilter = 'pdf' | 'doc' | 'docx' | 'all';

export const GDRIVE_FILES_PROXY = Symbol('GDRIVE_FILES_PROXY');

export type FilesProxy = (args: {
  accessToken: string;
  mimeFilter: DriveMimeFilter;
}) => Promise<{ files: ReadonlyArray<DriveFile> }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Account id failed the UUID check. The HTTP layer maps this; the
 * service does not build a Nest exception.
 */
export class InvalidDriveAccountIdError extends Error {
  readonly code = 'invalid-account-id' as const;
  constructor() {
    super('accountId_must_be_uuid');
    this.name = 'InvalidDriveAccountIdError';
  }
}

/** `mimeFilter` is outside pdf | doc | docx | all. */
export class UnsupportedDriveMimeError extends Error {
  readonly code = 'unsupported-mime' as const;
  constructor() {
    super('mime_filter_not_in_allow_list');
    this.name = 'UnsupportedDriveMimeError';
  }
}

/**
 * The files proxy threw. Wrapping keeps a `TokenExpiredError` from
 * `getAccessToken` distinct from a Drive HTTP failure: only the proxy
 * failure is mapped to a Drive error code.
 */
export class DriveFilesListFailedError extends Error {
  constructor(override readonly cause: unknown) {
    super('drive_files_list_failed', { cause });
    this.name = 'DriveFilesListFailedError';
  }
}

function parseMimeFilter(value: string): DriveMimeFilter {
  if (value === 'pdf' || value === 'doc' || value === 'docx' || value === 'all') return value;
  throw new UnsupportedDriveMimeError();
}

/**
 * Server-side Drive file list used by `GET /integrations/gdrive/files`.
 * Rate-limit and ownership failures propagate as the limiter's and
 * `GDriveService`'s own errors. HTTP status mapping lives in
 * `drive-files.http-errors.ts`.
 */
@Injectable()
export class DriveFilesService {
  constructor(
    private readonly drive: GDriveService,
    private readonly rateLimiter: GDriveRateLimiter,
    @Inject(GDRIVE_FILES_PROXY) private readonly filesProxy: FilesProxy,
  ) {}

  async listFiles(
    userId: string,
    accountId: string | undefined,
    mimeFilter: string = 'all',
  ): Promise<{ files: ReadonlyArray<DriveFile> }> {
    if (!accountId || !UUID_RE.test(accountId)) {
      throw new InvalidDriveAccountIdError();
    }
    const filter = parseMimeFilter(mimeFilter);
    // Bucket key is the user, never the account, so rotating account
    // ids cannot buy a fresh budget.
    await this.rateLimiter.acquire(userId);
    const { accessToken } = await this.drive.getAccessToken(accountId, userId);
    try {
      return await this.filesProxy({ accessToken, mimeFilter: filter });
    } catch (err) {
      throw new DriveFilesListFailedError(err);
    }
  }
}
