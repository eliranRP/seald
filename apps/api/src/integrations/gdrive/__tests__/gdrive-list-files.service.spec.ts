import { NotFoundException } from '@nestjs/common';
import { GDriveService } from '../gdrive.service';
import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';
import { DriveRequestError } from '../drive-request.errors';
import { GDriveError, TokenExpiredError } from '../dto/error-codes';
import type { FilesProxy } from '../files-proxy';

const ACCOUNT = '00000000-0000-0000-0000-000000000aaa';

function make(opts?: { capacity?: number; proxy?: FilesProxy }): {
  svc: GDriveService;
  proxy: jest.Mock;
  token: jest.SpyInstance;
} {
  const proxy = jest.fn(
    opts?.proxy ??
      (async () => ({ files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }] })),
  );
  const limiter = new GDriveRateLimiter({ capacity: opts?.capacity ?? 30, windowMs: 60_000 });
  const svc = new GDriveService({} as never, {} as never, {} as never, limiter, proxy);
  const token = jest
    .spyOn(svc, 'getAccessToken')
    .mockResolvedValue({ accessToken: 'at-1', expiresAt: Date.now() + 3_600_000 });
  return { svc, proxy, token };
}

describe('GDriveService.listFiles', () => {
  it('passes a fresh access token and mime filter to the proxy', async () => {
    const { svc, proxy, token } = make();
    const out = await svc.listFiles('user-1', ACCOUNT, 'pdf');
    expect(out.files).toHaveLength(1);
    expect(token).toHaveBeenCalledWith(ACCOUNT, 'user-1');
    expect(proxy).toHaveBeenCalledWith({ accessToken: 'at-1', mimeFilter: 'pdf' });
  });

  it('defaults the filter to all', async () => {
    const { svc, proxy } = make();
    await svc.listFiles('user-1', ACCOUNT);
    expect(proxy).toHaveBeenCalledWith({ accessToken: 'at-1', mimeFilter: 'all' });
  });

  it('rejects a non-uuid accountId before touching the limiter or proxy', async () => {
    const { svc, proxy } = make();
    await expect(svc.listFiles('user-1', 'nope')).rejects.toMatchObject({
      code: 'invalid-account-id',
    });
    expect(proxy).not.toHaveBeenCalled();
  });

  it('rejects a mime filter outside the allow-list', async () => {
    const { svc, proxy } = make();
    const err = await svc.listFiles('user-1', ACCOUNT, 'xls' as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveRequestError);
    expect((err as DriveRequestError).code).toBe('unsupported-mime');
    expect(proxy).not.toHaveBeenCalled();
  });

  it('rate-limits per user, not per account', async () => {
    const { svc } = make({ capacity: 1 });
    await svc.listFiles('user-1', ACCOUNT);
    await expect(
      svc.listFiles('user-1', '00000000-0000-0000-0000-000000000bbb'),
    ).rejects.toBeInstanceOf(RateLimitedError);
    await expect(svc.listFiles('user-2', ACCOUNT)).resolves.toBeDefined();
  });

  it('lets NotFound (account not owned) through', async () => {
    const { svc, token } = make();
    token.mockRejectedValueOnce(new NotFoundException('gdrive_account_not_found'));
    await expect(svc.listFiles('user-1', ACCOUNT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [401, TokenExpiredError, 'token-expired'],
    [403, GDriveError, 'oauth-declined'],
    [500, GDriveError, 'drive-upstream-error'],
  ])('maps Drive %i to a domain error without leaking the token', async (status, cls, code) => {
    const { svc } = make({
      proxy: async () => {
        throw new Error(`drive_files_list_failed: ${status} at-1`);
      },
    });
    const err = await svc.listFiles('user-1', ACCOUNT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(cls);
    expect((err as GDriveError).code).toBe(code);
    expect((err as GDriveError).message).not.toContain('at-1');
  });
});
