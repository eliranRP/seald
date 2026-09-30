import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { TokenExpiredError } from './dto/error-codes';
import {
  DriveFilesListFailedError,
  InvalidDriveAccountIdError,
  UnsupportedDriveMimeError,
} from './drive-files.service';
import { RateLimitedError } from './rate-limiter';

/**
 * Maps a files-proxy failure (or a token error raised while resolving
 * the access token for the picker) onto the Drive error vocabulary.
 * The body never includes `err.message`.
 */
export function mapDriveError(err: unknown): HttpException {
  if (err instanceof NotFoundException) return err;
  if (err instanceof TokenExpiredError) {
    return new HttpException(
      { code: 'token-expired', message: 'reconnect_required' },
      HttpStatus.UNAUTHORIZED,
    );
  }
  if (err instanceof Error) {
    const match = /drive_files_list_failed:\s*(\d{3})/.exec(err.message);
    const statusText = match?.[1];
    if (statusText) {
      const status = Number(statusText);
      if (status === 401) {
        return new HttpException(
          { code: 'token-expired', message: 'reconnect_required' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (status === 403) {
        return new HttpException(
          { code: 'oauth-declined', message: 'permission_denied_or_consent_revoked' },
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }
  return new HttpException(
    { code: 'drive-upstream-error', message: 'drive_request_failed' },
    HttpStatus.BAD_GATEWAY,
  );
}

/**
 * HTTP mapping for `DriveFilesService.listFiles`. Returns null when the
 * error is not one this route owns, so `NotFoundException` and
 * `TokenExpiredError` from `getAccessToken` stay unwrapped.
 */
export function mapDriveFilesHttpError(err: unknown): HttpException | null {
  if (err instanceof InvalidDriveAccountIdError) {
    return new BadRequestException({
      code: 'invalid-account-id',
      message: 'accountId_must_be_uuid',
    });
  }
  if (err instanceof UnsupportedDriveMimeError) {
    return new HttpException(
      { code: 'unsupported-mime', message: 'mime_filter_not_in_allow_list' },
      HttpStatus.BAD_REQUEST,
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
  if (err instanceof DriveFilesListFailedError) {
    return mapDriveError(err.cause);
  }
  return null;
}
