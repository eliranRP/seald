import { HttpException, HttpStatus } from '@nestjs/common';
import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  GDriveError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../integrations/gdrive/dto/error-codes';
import { RateLimitedError } from '../integrations/gdrive/rate-limiter';

/**
 * Map the errors that flow out of `EnvelopesService.saveToGoogleDrive`
 * onto HTTP exceptions. `NotFoundException` / `ConflictException` thrown
 * by the service (envelope not found / not sealed) pass straight through;
 * the gdrive-domain errors get the wireframe `{ code, message }` body.
 *
 * The save route throws the result. A later MCP tool maps the same
 * classes onto tool slugs instead of inventing a second vocabulary.
 */
export function mapGdriveSaveError(err: unknown): unknown {
  if (err instanceof HttpException) return err;
  if (err instanceof GdriveNotConnectedError) {
    return new HttpException(
      { code: 'gdrive-not-connected', message: 'gdrive_not_connected' },
      HttpStatus.CONFLICT,
    );
  }
  if (err instanceof TokenExpiredError) {
    return new HttpException(
      { code: 'token-expired', message: 'reconnect_required' },
      HttpStatus.CONFLICT,
    );
  }
  if (err instanceof RateLimitedError) {
    return new HttpException(
      {
        code: 'rate-limited',
        message: 'gdrive_rate_limited',
        retryAfter: Math.ceil(err.retryAfterMs / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (err instanceof DrivePermissionDeniedError) {
    return new HttpException(
      { code: 'permission-denied', message: 'folder_not_writable' },
      HttpStatus.FORBIDDEN,
    );
  }
  if (err instanceof DriveUpstreamError || err instanceof GDriveError) {
    return new HttpException(
      { code: 'drive-upstream-error', message: 'drive_request_failed' },
      HttpStatus.BAD_GATEWAY,
    );
  }
  // Unknown — opaque 502, body deliberately omits err.message.
  return new HttpException(
    { code: 'drive-upstream-error', message: 'drive_request_failed' },
    HttpStatus.BAD_GATEWAY,
  );
}
