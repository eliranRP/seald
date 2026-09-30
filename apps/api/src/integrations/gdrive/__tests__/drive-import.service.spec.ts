import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { mapConversionStartHttpError } from '../conversion/conversion.http-errors';
import type { ConversionService } from '../conversion/conversion.service';
import {
  DriveImportService,
  InvalidConversionAccountIdError,
  InvalidConversionFileIdError,
  UnsupportedConversionMimeError,
} from '../drive-import.service';
import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';

const ACCOUNT = '00000000-0000-0000-0000-000000000aaa';
const PDF = 'application/pdf';

function makeService(opts?: { capacity?: number }): {
  svc: DriveImportService;
  start: jest.Mock;
  limiter: GDriveRateLimiter;
} {
  const start = jest.fn(async () => ({ jobId: 'job-1', status: 'pending' as const }));
  const conversion = { start } as unknown as ConversionService;
  const limiter = new GDriveRateLimiter({
    capacity: opts?.capacity ?? 30,
    windowMs: 60_000,
  });
  return { svc: new DriveImportService(conversion, limiter), start, limiter };
}

describe('DriveImportService.start', () => {
  it('validates, rate-limits, then starts the conversion', async () => {
    const { svc, start } = makeService();
    const out = await svc.start('user-1', {
      accountId: ACCOUNT,
      fileId: 'file-1',
      mimeType: PDF,
    });
    expect(out).toEqual({ jobId: 'job-1', status: 'pending' });
    expect(start).toHaveBeenCalledWith({
      userId: 'user-1',
      accountId: ACCOUNT,
      fileId: 'file-1',
      mimeType: PDF,
    });
  });

  it('rejects a bad account, file id, or mime before calling conversion', async () => {
    const { svc, start } = makeService();
    await expect(
      svc.start('user-1', { accountId: 'nope', fileId: 'file-1', mimeType: PDF }),
    ).rejects.toBeInstanceOf(InvalidConversionAccountIdError);
    await expect(
      svc.start('user-1', { accountId: ACCOUNT, fileId: '', mimeType: PDF }),
    ).rejects.toBeInstanceOf(InvalidConversionFileIdError);
    await expect(
      svc.start('user-1', { accountId: ACCOUNT, fileId: 'file-1', mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(UnsupportedConversionMimeError);
    expect(start).not.toHaveBeenCalled();
  });

  it('propagates RateLimitedError from the shared per-user bucket', async () => {
    const { svc, limiter } = makeService({ capacity: 100 });
    jest.spyOn(limiter, 'acquire').mockRejectedValueOnce(new RateLimitedError(12_345));
    await expect(
      svc.start('user-1', { accountId: ACCOUNT, fileId: 'file-1', mimeType: PDF }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe('mapConversionStartHttpError', () => {
  it('preserves the conversion route bodies', () => {
    expect(mapConversionStartHttpError(new UnsupportedConversionMimeError()).getResponse()).toBe(
      'unsupported-mime',
    );
    const limited = mapConversionStartHttpError(new RateLimitedError(12_345));
    expect(limited.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(limited.getResponse()).toEqual({
      code: 'rate-limited',
      message: 'rate-limited',
      retryAfter: 13,
    });
    const tooLarge = mapConversionStartHttpError(
      Object.assign(new Error('too large'), { code: 'file-too-large' }),
    );
    expect(tooLarge.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(tooLarge.getResponse()).toEqual({ code: 'file-too-large', message: 'file-too-large' });
    const secret = mapConversionStartHttpError(new Error('upstream said: at-secret-token-99'));
    expect(JSON.stringify(secret.getResponse())).not.toContain('at-secret-token-99');
    const missing = new NotFoundException('gdrive_account_not_found');
    expect(mapConversionStartHttpError(missing)).toBe(missing);
    const teapot = new HttpException('upstream said: at-secret-token-99', 418);
    const mapped = mapConversionStartHttpError(teapot);
    expect(mapped).not.toBe(teapot);
    expect(mapped.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(mapped.getResponse()).toEqual({
      code: 'conversion-failed',
      message: 'conversion-failed',
    });
    expect(JSON.stringify(mapped.getResponse())).not.toContain('at-secret-token-99');
  });
});
