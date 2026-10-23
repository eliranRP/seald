import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MCP_DRIVE_IMPORT_WAIT_SECONDS, type McpStagedDocument } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  DriveImportError,
  DriveImportPendingError,
  DriveImportService,
} from '../integrations/gdrive/conversion/drive-import.service';
import { ALLOWED_CONVERSION_MIMES } from '../integrations/gdrive/conversion/dto/conversion.dto';
import { DriveRequestError } from '../integrations/gdrive/drive-request.errors';
import { GDriveError } from '../integrations/gdrive/dto/error-codes';
import type { DriveMimeFilter } from '../integrations/gdrive/files-proxy';
import { GDriveService } from '../integrations/gdrive/gdrive.service';
import { GDriveRateLimiter, RateLimitedError } from '../integrations/gdrive/rate-limiter';
import { StagedUploadsService } from './staged-uploads.service';

/** Drive `files.get` metadata the import needs. */
export interface DriveFileMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number | null;
}

/**
 * `files.get(fileId, fields=id,name,mimeType,size)`. Under `drive.file`
 * Google answers 404 (or 403) for a file the app was never granted.
 */
export type DriveFileMetadataFetcher = (args: {
  readonly accessToken: string;
  readonly fileId: string;
}) => Promise<{ readonly status: number; readonly file: DriveFileMetadata | null }>;

export const DRIVE_FILE_METADATA_FETCHER = Symbol('DRIVE_FILE_METADATA_FETCHER');

export function makeDriveFileMetadataFetcher(
  fetchImpl: typeof fetch = fetch,
): DriveFileMetadataFetcher {
  return async ({ accessToken, fileId }) => {
    const url =
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
      '?fields=id,name,mimeType,size&supportsAllDrives=true';
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { status: res.status, file: null };
    const json = (await res.json()) as Partial<{
      id: string;
      name: string;
      mimeType: string;
      size: string;
    }>;
    if (typeof json.id !== 'string' || typeof json.mimeType !== 'string') {
      return { status: 502, file: null };
    }
    return {
      status: res.status,
      file: {
        id: json.id,
        name: typeof json.name === 'string' && json.name.length > 0 ? json.name : json.id,
        mimeType: json.mimeType,
        size: json.size !== undefined && /^\d+$/.test(json.size) ? Number(json.size) : null,
      },
    };
  };
}

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const FILE_ID = /^[A-Za-z0-9_-]{10,256}$/;

/** A Drive or Docs share link → its file id, or null. */
export function parseDriveShareUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !DRIVE_HOSTS.has(url.hostname)) return null;
  const byPath = /\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  const candidate = byPath ?? url.searchParams.get('id') ?? undefined;
  return candidate !== undefined && FILE_ID.test(candidate) ? candidate : null;
}

export type DriveImportOutcome =
  | {
      readonly status: 'done';
      readonly job_id: string | null;
      readonly document: McpStagedDocument;
    }
  | { readonly status: 'conversion_pending'; readonly job_id: string; readonly document: null };

export interface DriveFileView {
  readonly id: string;
  readonly name: string;
  readonly mime_type: string;
  readonly modified_time: string | null;
  readonly size: number | null;
}

/**
 * Google Drive for MCP (docs/design/mcp-server.md M5 and step 8d; parity
 * plan WP-19). The OAuth scope stays `drive.file`: listing and search
 * only see files the owner picked or the app created, and a file the app
 * cannot read is `gdrive_file_not_picked` with a Seald app link where the
 * owner picks it. No URL here carries a Google token or developer key.
 *
 * Imports go through `DriveImportService` (WP-12) and land in the staged
 * uploads table, so the result is a `document_id` like any upload.
 * Domain errors become HTTP exceptions with the wire slugs, so the MCP
 * tool layer maps them like any service error.
 */
@Injectable()
export class DriveSourceService {
  constructor(
    private readonly gdrive: GDriveService,
    private readonly imports: DriveImportService,
    private readonly limiter: GDriveRateLimiter,
    private readonly uploads: StagedUploadsService,
    @Inject(DRIVE_FILE_METADATA_FETCHER) private readonly fetchMetadata: DriveFileMetadataFetcher,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** Settings page where the owner connects Drive once. */
  connectUrl(): string {
    return `${this.env.APP_PUBLIC_URL.replace(/\/$/, '')}/settings/integrations`;
  }

  /** The send flow, where the owner picks a Drive file with Google's picker. */
  pickerUrl(): string {
    return `${this.env.APP_PUBLIC_URL.replace(/\/$/, '')}/document/new`;
  }

  async listAccounts(owner_id: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly google_email: string;
      readonly connected_at: string;
      readonly token_status: 'live' | 'reconnect_required';
    }>
  > {
    const rows = (await this.gdrive.listAccounts(owner_id)).filter((r) => !r.deletedAt);
    return rows.map((r) => ({
      id: r.id,
      google_email: r.googleEmail,
      connected_at: new Date(r.connectedAt).toISOString(),
      token_status: this.gdrive.getTokenStatus(r.id),
    }));
  }

  /**
   * `account_id` is optional with one connected account and required
   * with several. None connected: `gdrive_not_connected` and the connect link.
   */
  async resolveAccount(owner_id: string, account_id?: string): Promise<string> {
    const accounts = await this.listAccounts(owner_id);
    if (accounts.length === 0) {
      throw new ConflictException({ message: 'gdrive_not_connected', url: this.connectUrl() });
    }
    if (account_id !== undefined) {
      if (!accounts.some((a) => a.id === account_id)) {
        throw new NotFoundException('gdrive_account_not_found');
      }
      return account_id;
    }
    const only = accounts[0];
    if (accounts.length > 1 || !only) throw new BadRequestException('gdrive_account_required');
    return only.id;
  }

  /** `gdrive_list_files` and `gdrive_search_files` (`q` is a name substring). */
  async listFiles(
    owner_id: string,
    input: {
      readonly account_id?: string;
      readonly mime?: DriveMimeFilter;
      readonly q?: string;
      readonly limit?: number;
      readonly cursor?: string;
    },
  ): Promise<{
    readonly account_id: string;
    readonly files: ReadonlyArray<DriveFileView>;
    readonly next_cursor: string | null;
  }> {
    const accountId = await this.resolveAccount(owner_id, input.account_id);
    try {
      const page = await this.gdrive.listFiles(owner_id, accountId, input.mime ?? 'all', {
        pageSize: input.limit ?? 20,
        ...(input.q !== undefined ? { nameContains: input.q } : {}),
        ...(input.cursor !== undefined ? { pageToken: input.cursor } : {}),
      });
      return {
        account_id: accountId,
        files: page.files.map((f) => ({
          id: f.id,
          name: f.name,
          mime_type: f.mimeType,
          modified_time: f.modifiedTime ?? null,
          size: f.size !== undefined && /^\d+$/.test(f.size) ? Number(f.size) : null,
        })),
        next_cursor: page.nextPageToken ?? null,
      };
    } catch (err) {
      throw this.mapDriveError(err);
    }
  }

  /** The file id of an import request (`file_id` as given, or parsed from `share_url`). */
  fileIdOf(input: { readonly file_id?: string; readonly share_url?: string }): string {
    if (input.file_id !== undefined) return input.file_id;
    const parsed = input.share_url !== undefined ? parseDriveShareUrl(input.share_url) : null;
    if (parsed === null) throw new BadRequestException('gdrive_share_url_invalid');
    return parsed;
  }

  /** Dry run of {@link importFile}: account and file id only, no Google call. */
  async previewImport(
    owner_id: string,
    input: { readonly file_id?: string; readonly share_url?: string; readonly account_id?: string },
  ): Promise<Record<string, unknown>> {
    const accountId = await this.resolveAccount(owner_id, input.account_id);
    return { account_id: accountId, file_id: this.fileIdOf(input) };
  }

  /**
   * `gdrive_import`: read the file's metadata (proves the app may read
   * it), convert or fetch it on today's Drive path, and stage the PDF.
   * Waits up to 25 seconds; a slower conversion is `conversion_pending`
   * with a job id for `gdrive_conversion_status`.
   */
  async importFile(
    owner_id: string,
    input: { readonly file_id?: string; readonly share_url?: string; readonly account_id?: string },
    now: Date = new Date(),
    waitMs: number = MCP_DRIVE_IMPORT_WAIT_SECONDS * 1000,
  ): Promise<DriveImportOutcome> {
    const fileId = this.fileIdOf(input);
    const accountId = await this.resolveAccount(owner_id, input.account_id);
    const meta = await this.metadata(owner_id, accountId, fileId);
    if (!(ALLOWED_CONVERSION_MIMES as readonly string[]).includes(meta.mimeType)) {
      throw new UnsupportedMediaTypeException('unsupported-mime');
    }
    const row = await this.uploads.beginDriveImport(
      owner_id,
      { drive_file_id: fileId, drive_file_name: meta.name },
      now,
    );
    try {
      const done = await this.imports.importFile({
        userId: owner_id,
        accountId,
        fileId,
        mimeType: meta.mimeType,
        timeoutMs: waitMs,
        onTimeout: 'pending',
        onStarted: async (id) => {
          await this.uploads.setConversionJob(owner_id, row.id, id);
        },
      });
      const document = await this.uploads.finishDriveImport(owner_id, row.id, done.jobId, now);
      return { status: 'done', job_id: done.jobId, document };
    } catch (err) {
      if (err instanceof DriveImportPendingError) {
        return { status: 'conversion_pending', job_id: err.jobId, document: null };
      }
      await this.uploads.abandonDriveImport(owner_id, row.id);
      throw this.mapDriveError(err);
    }
  }

  /** `gdrive_conversion_status`: finish a pending import once its job is done. */
  async conversionStatus(
    owner_id: string,
    job_id: string,
    now: Date = new Date(),
  ): Promise<DriveImportOutcome> {
    const row = await this.uploads.findByConversionJob(owner_id, job_id);
    if (!row) throw new NotFoundException('job_not_found');
    if (row.completed_at !== null) {
      return { status: 'done', job_id, document: this.uploads.view(row) };
    }
    const view = this.imports.view(job_id, owner_id);
    if (view === null) {
      // The in-process job map lost it (restart): the import must start again.
      await this.uploads.abandonDriveImport(owner_id, row.id);
      throw new ConflictException('conversion-failed');
    }
    if (view.status === 'done') {
      const document = await this.uploads.finishDriveImport(owner_id, row.id, job_id, now);
      return { status: 'done', job_id, document };
    }
    if (view.status === 'failed' || view.status === 'cancelled') {
      await this.uploads.abandonDriveImport(owner_id, row.id);
      throw this.mapDriveError(
        new DriveImportError(
          view.status === 'failed' ? (view.errorCode ?? 'conversion-failed') : 'cancelled',
        ),
      );
    }
    return { status: 'conversion_pending', job_id, document: null };
  }

  /** `gdrive_conversion_cancel`. */
  async cancelConversion(owner_id: string, job_id: string): Promise<void> {
    const row = await this.uploads.findByConversionJob(owner_id, job_id);
    if (!row || row.completed_at !== null || !this.imports.cancel(job_id, owner_id)) {
      throw new NotFoundException('job_not_found_or_terminal');
    }
    await this.uploads.abandonDriveImport(owner_id, row.id);
  }

  /** Read-only check for the cancel dry run. */
  async assertCancellable(owner_id: string, job_id: string): Promise<void> {
    const row = await this.uploads.findByConversionJob(owner_id, job_id);
    const view = this.imports.view(job_id, owner_id);
    if (
      !row ||
      row.completed_at !== null ||
      !view ||
      view.status === 'done' ||
      view.status === 'failed' ||
      view.status === 'cancelled'
    ) {
      throw new NotFoundException('job_not_found_or_terminal');
    }
  }

  private async metadata(
    owner_id: string,
    accountId: string,
    fileId: string,
  ): Promise<DriveFileMetadata> {
    try {
      await this.limiter.acquire(owner_id);
      const { accessToken } = await this.gdrive.getAccessToken(accountId, owner_id);
      const res = await this.fetchMetadata({ accessToken, fileId });
      if (res.file) return res.file;
      if (res.status === 401) throw new GDriveError('token-expired', 'drive_401');
      if (res.status === 403 || res.status === 404) {
        throw new ConflictException({ message: 'gdrive_file_not_picked', url: this.pickerUrl() });
      }
      throw new BadGatewayException('drive-upstream-error');
    } catch (err) {
      throw this.mapDriveError(err);
    }
  }

  /** Drive domain errors → the HTTP slugs the Drive routes already use. */
  private mapDriveError(err: unknown): unknown {
    if (err instanceof HttpException) return err;
    if (err instanceof RateLimitedError) {
      return new HttpException(
        { message: 'rate_limited', retryAfter: Math.max(1, Math.ceil(err.retryAfterMs / 1000)) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (err instanceof DriveRequestError) return new BadRequestException(err.code);
    if (err instanceof DriveImportError) {
      switch (err.code) {
        case 'token-expired':
          return new ConflictException({ message: 'token-expired', url: this.connectUrl() });
        case 'oauth-declined':
          return new ForbiddenException('oauth-declined');
        case 'file-too-large':
          return new PayloadTooLargeException('file_too_large');
        case 'unsupported-mime':
          return new UnsupportedMediaTypeException('unsupported-mime');
        case 'cancelled':
          return new ConflictException('conversion_cancelled');
        default:
          return new BadGatewayException('conversion-failed');
      }
    }
    if (err instanceof GDriveError) {
      if (err.code === 'token-expired') {
        return new ConflictException({ message: 'token-expired', url: this.connectUrl() });
      }
      if (err.code === 'oauth-declined' || err.code === 'permission-denied') {
        return new ForbiddenException(err.code);
      }
      return new BadGatewayException('drive-upstream-error');
    }
    return err;
  }
}
