import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  GDriveError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../../integrations/gdrive/dto/error-codes';
import { RateLimitedError } from '../../integrations/gdrive/rate-limiter';
import { mapGdriveSaveError } from '../gdrive-save-error.service';

describe('mapGdriveSaveError', () => {
  it('returns HttpExceptions unchanged', () => {
    const notFound = new NotFoundException('envelope_not_found');
    const conflict = new ConflictException('envelope_not_sealed');
    expect(mapGdriveSaveError(notFound)).toBe(notFound);
    expect(mapGdriveSaveError(conflict)).toBe(conflict);
  });

  it.each<[unknown, number, string]>([
    [new GdriveNotConnectedError(), 409, 'gdrive_not_connected'],
    [new TokenExpiredError(), 409, 'reconnect_required'],
    [new DrivePermissionDeniedError(), 403, 'folder_not_writable'],
    [new DriveUpstreamError(), 502, 'drive_request_failed'],
    [new GDriveError('drive-upstream-error'), 502, 'drive_request_failed'],
    [new Error('socket hang up'), 502, 'drive_request_failed'],
  ])('maps %p to HTTP %i %s', (thrown, status, message) => {
    const mapped = mapGdriveSaveError(thrown);
    expect(mapped).toBeInstanceOf(HttpException);
    const http = mapped as HttpException;
    expect(http.getStatus()).toBe(status);
    const body = http.getResponse() as { message: string };
    expect(body.message).toBe(message);
  });

  it('maps RateLimitedError to 429 with retryAfter in seconds', () => {
    const mapped = mapGdriveSaveError(new RateLimitedError(45_000)) as HttpException;
    expect(mapped.getStatus()).toBe(429);
    const body = mapped.getResponse() as { code: string; retryAfter: number };
    expect(body.code).toBe('rate-limited');
    expect(body.retryAfter).toBe(45);
  });
});
