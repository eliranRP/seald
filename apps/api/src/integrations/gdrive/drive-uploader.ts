/**
 * Thin port over the Drive v3 upload endpoints (`files.create` /
 * `files.update`). Kept behind a symbol so the unit suite can inject a
 * fake and assert the create-vs-update branch without a live Google.
 * The production binding lives in `drive-uploader.adapters.ts`.
 *
 * Both methods POST/PATCH multipart-or-media bodies and ask Drive for
 * `fields=id,name,webViewLink`. `supportsAllDrives=true` is always set
 * so a folder picked inside a Workspace shared drive isn't rejected.
 *
 * Error contract: throw {@link DrivePermissionDeniedError} on a Drive
 * `403`, {@link RateLimitedError} on a `429` (honoring `Retry-After`),
 * {@link DriveFileNotFoundError} on a `404` (so the caller can fall back
 * from `update` to `create`), and {@link DriveUpstreamError} for any
 * other non-2xx / transport failure. Never echo the upstream body.
 */
export interface DriveCreateMetadata {
  readonly name: string;
  readonly parents: ReadonlyArray<string>;
  readonly mimeType: string;
}

export interface DriveUploadedFile {
  readonly id: string;
  readonly name: string;
  readonly webViewLink: string;
}

export interface DriveUploader {
  create(args: {
    accessToken: string;
    metadata: DriveCreateMetadata;
    bytes: Buffer;
    signal?: AbortSignal;
  }): Promise<DriveUploadedFile>;
  update(args: {
    accessToken: string;
    fileId: string;
    bytes: Buffer;
    signal?: AbortSignal;
  }): Promise<DriveUploadedFile>;
}

export const DRIVE_UPLOADER = Symbol('DRIVE_UPLOADER');

/**
 * Distinguishes a Drive `404 Not Found` (the previously-recorded file id
 * was trashed/deleted) from other upstream errors so {@link
 * GdriveExportService} can fall back to creating a fresh file.
 */
export class DriveFileNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'drive_file_not_found');
    this.name = 'DriveFileNotFoundError';
  }
}
