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
  | 'rate-limited';

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
