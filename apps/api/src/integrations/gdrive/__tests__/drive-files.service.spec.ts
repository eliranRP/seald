import { HttpStatus, NotFoundException } from '@nestjs/common';
import { TokenExpiredError } from '../dto/error-codes';
import {
  DriveFilesListFailedError,
  DriveFilesService,
  InvalidDriveAccountIdError,
  UnsupportedDriveMimeError,
  type FilesProxy,
} from '../drive-files.service';
import { mapDriveFilesHttpError } from '../drive-files.http-errors';
import type { GDriveService } from '../gdrive.service';
import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';

const ACCOUNT = '00000000-0000-0000-0000-000000000aaa';

function makeService(opts?: { capacity?: number; proxy?: FilesProxy }): {
  svc: DriveFilesService;
  getAccessToken: jest.Mock;
  proxy: jest.Mock;
  limiter: GDriveRateLimiter;
} {
  const getAccessToken = jest.fn(async () => ({ accessToken: 'at-1', expiresAt: 1 }));
  const drive = { getAccessToken } as unknown as GDriveService;
  const limiter = new GDriveRateLimiter({
    capacity: opts?.capacity ?? 30,
    windowMs: 60_000,
  });
  const proxy = jest.fn(
    opts?.proxy ??
      (async () => ({ files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }] })),
  );
  const svc = new DriveFilesService(drive, limiter, proxy);
  return { svc, getAccessToken, proxy, limiter };
}

describe('DriveFilesService.listFiles', () => {
  it('asks the proxy with the fresh access token and the mime filter', async () => {
    const { svc, getAccessToken, proxy } = makeService();
    const out = await svc.listFiles('user-1', ACCOUNT, 'pdf');
    expect(out.files).toEqual([{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }]);
    expect(getAccessToken).toHaveBeenCalledWith(ACCOUNT, 'user-1');
    expect(proxy).toHaveBeenCalledWith({ accessToken: 'at-1', mimeFilter: 'pdf' });
  });

  it('rejects a non-UUID account id before touching Drive', async () => {
    const { svc, proxy, getAccessToken } = makeService();
    await expect(svc.listFiles('user-1', 'not-a-uuid', 'pdf')).rejects.toBeInstanceOf(
      InvalidDriveAccountIdError,
    );
    expect(proxy).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown mime filter before consuming a rate-limit token', async () => {
    const { svc, proxy } = makeService({ capacity: 1 });
    await expect(svc.listFiles('user-1', ACCOUNT, 'exe')).rejects.toBeInstanceOf(
      UnsupportedDriveMimeError,
    );
    await expect(svc.listFiles('user-1', ACCOUNT, 'pdf')).resolves.toEqual({
      files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }],
    });
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it('propagates RateLimitedError instead of an HTTP exception', async () => {
    const { svc } = makeService({ capacity: 1 });
    await svc.listFiles('user-1', ACCOUNT, 'pdf');
    await expect(svc.listFiles('user-1', ACCOUNT, 'pdf')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('keys the rate limit by user id', async () => {
    const { svc } = makeService({ capacity: 1 });
    const other = '00000000-0000-0000-0000-000000000bbb';
    await svc.listFiles('user-1', ACCOUNT, 'pdf');
    await expect(svc.listFiles('user-1', other, 'pdf')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('lets NotFoundException and TokenExpiredError from token resolution through', async () => {
    const missing = makeService();
    missing.getAccessToken.mockRejectedValueOnce(new NotFoundException('gdrive_account_not_found'));
    await expect(missing.svc.listFiles('user-1', ACCOUNT, 'pdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const expired = makeService();
    expired.getAccessToken.mockRejectedValueOnce(
      new TokenExpiredError('refresh_token_invalid_or_revoked'),
    );
    await expect(expired.svc.listFiles('user-1', ACCOUNT, 'pdf')).rejects.toBeInstanceOf(
      TokenExpiredError,
    );
  });

  it('wraps a proxy failure so the HTTP mapper can read the status', async () => {
    const { svc } = makeService({
      proxy: async () => {
        throw new Error('drive_files_list_failed: 401');
      },
    });
    const err = await svc.listFiles('user-1', ACCOUNT, 'all').catch((caught: unknown) => caught);
    expect(err).toBeInstanceOf(DriveFilesListFailedError);
    expect((err as DriveFilesListFailedError).cause).toEqual(
      expect.objectContaining({ message: 'drive_files_list_failed: 401' }),
    );
  });
});

describe('mapDriveFilesHttpError', () => {
  it('maps validation, rate limit, and proxy statuses to the existing bodies', () => {
    expect(mapDriveFilesHttpError(new InvalidDriveAccountIdError())?.getResponse()).toEqual({
      code: 'invalid-account-id',
      message: 'accountId_must_be_uuid',
    });
    const mime = mapDriveFilesHttpError(new UnsupportedDriveMimeError());
    expect(mime?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(mime?.getResponse()).toEqual({
      code: 'unsupported-mime',
      message: 'mime_filter_not_in_allow_list',
    });
    const limited = mapDriveFilesHttpError(new RateLimitedError(12_345));
    expect(limited?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(limited?.getResponse()).toEqual({
      code: 'rate-limited',
      message: 'gdrive_rate_limited',
      retryAfter: 13,
    });
    const denied = mapDriveFilesHttpError(
      new DriveFilesListFailedError(new Error('drive_files_list_failed: 403')),
    );
    expect(denied?.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(denied?.getResponse()).toEqual({
      code: 'oauth-declined',
      message: 'permission_denied_or_consent_revoked',
    });
    const upstream = mapDriveFilesHttpError(
      new DriveFilesListFailedError(new Error('drive_files_list_failed: 503 token=at-secret')),
    );
    expect(upstream?.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(JSON.stringify(upstream?.getResponse())).not.toContain('at-secret');
  });

  it('does not map token-resolution errors', () => {
    expect(mapDriveFilesHttpError(new NotFoundException('gdrive_account_not_found'))).toBeNull();
    expect(mapDriveFilesHttpError(new TokenExpiredError())).toBeNull();
  });
});
