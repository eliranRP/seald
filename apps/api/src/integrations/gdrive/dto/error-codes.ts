/**
 * Named error codes for the gdrive integration. Each one maps directly to
 * a wireframe error state in `Design-Guide/project/gdrive-integration/`
 * (Phase 2/3 surfaces). Frontend and backend MUST agree on the literal
 * string — these are the public contract.
 */
export type GDriveErrorCode =
  | 'token-expired'
  | 'oauth-declined'
  | 'no-files-match-filter'
  | 'conversion-failed'
  | 'file-too-large'
  | 'unsupported-mime'
  | 'rate-limited'
  // --- envelope-export ("Save to Google Drive") surface ---
  | 'gdrive-not-connected'
  | 'envelope-not-sealed'
  | 'permission-denied'
  | 'drive-upstream-error';

export class GDriveError extends Error {
  constructor(
    public readonly code: GDriveErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GDriveError';
  }
}

export class TokenExpiredError extends GDriveError {
  constructor(message?: string) {
    super('token-expired', message);
  }
}

export class OAuthDeclinedError extends GDriveError {
  constructor(message?: string) {
    super('oauth-declined', message);
  }
}

/**
 * Thrown by {@link GdriveExportService} when the user has no connected
 * (non-soft-deleted) `gdrive_accounts` row. The envelopes controller
 * maps this to `409 gdrive_not_connected`.
 */
export class GdriveNotConnectedError extends GDriveError {
  constructor(message?: string) {
    super('gdrive-not-connected', message ?? 'gdrive_not_connected');
  }
}

/**
 * Drive returned `403` (insufficient permissions / folder gone). Maps to
 * `403 folder_not_writable`.
 */
export class DrivePermissionDeniedError extends GDriveError {
  constructor(message?: string) {
    super('permission-denied', message ?? 'folder_not_writable');
  }
}

/**
 * Drive returned a `5xx`, a transport error, or any non-2xx we don't have
 * a more specific mapping for. Maps to an opaque `502 drive_request_failed`
 * — we never echo the upstream body.
 */
export class DriveUpstreamError extends GDriveError {
  constructor(message?: string) {
    super('drive-upstream-error', message ?? 'drive_request_failed');
  }
}
