import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ConversionGateway } from '../conversion/conversion.gateway';
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
  gateway: ConversionGateway;
  limiter: GDriveRateLimiter;
} {
  const start = jest.fn(async () => ({ jobId: 'job-1', status: 'pending' as const }));
  const conversion = { start } as unknown as ConversionService;
  const gateway = new ConversionGateway();
  const limiter = new GDriveRateLimiter({
    capacity: opts?.capacity ?? 30,
    windowMs: 60_000,
  });
  return { svc: new DriveImportService(conversion, limiter, gateway), start, gateway, limiter };
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

describe('DriveImportService.collect', () => {
  function clock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
  }

  it('returns a done job with a pdf file name', async () => {
    const { svc, gateway } = makeService();
    const { jobId } = gateway.start('user-1');
    gateway.markDone(jobId, 'https://signed/notes.pdf');
    const out = await svc.collect('user-1', jobId, { fileName: 'Notes', ...clock() });
    expect(out).toEqual({
      status: 'done',
      assetUrl: 'https://signed/notes.pdf',
      fileName: 'Notes.pdf',
    });
  });

  it('keeps a name that already ends in .pdf', async () => {
    const { svc, gateway } = makeService();
    const { jobId } = gateway.start('user-1');
    gateway.markDone(jobId, 'https://signed/a.pdf');
    const out = await svc.collect('user-1', jobId, { fileName: 'Contract.PDF', ...clock() });
    expect(out).toMatchObject({ status: 'done', fileName: 'Contract.PDF' });
  });

  it('waits through pending and returns failed, cancelled, or timed_out', async () => {
    const failed = makeService();
    const failedJob = failed.gateway.start('user-1').jobId;
    failed.gateway.markFailed(failedJob, 'file-too-large');
    await expect(failed.svc.collect('user-1', failedJob, clock())).resolves.toEqual({
      status: 'failed',
      errorCode: 'file-too-large',
    });

    const cancelled = makeService();
    const cancelJob = cancelled.gateway.start('user-1').jobId;
    cancelled.gateway.cancel(cancelJob, 'user-1');
    await expect(cancelled.svc.collect('user-1', cancelJob, clock())).resolves.toEqual({
      status: 'cancelled',
    });

    const pending = makeService();
    const pendingJob = pending.gateway.start('user-1').jobId;
    await expect(
      pending.svc.collect('user-1', pendingJob, {
        timeoutMs: 3_000,
        pollIntervalMs: 1_500,
        ...clock(),
      }),
    ).resolves.toEqual({ status: 'timed_out', jobId: pendingJob });
  });

  it('treats a missing job, including another user, as conversion-failed', async () => {
    const { svc, gateway } = makeService();
    const { jobId } = gateway.start('user-2');
    await expect(svc.collect('user-1', jobId, clock())).resolves.toEqual({
      status: 'failed',
      errorCode: 'conversion-failed',
    });
  });

  it('keeps waiting while the job is done without an asset url', async () => {
    const { svc, gateway } = makeService();
    const { jobId } = gateway.start('user-1');
    gateway.setStatus(jobId, 'done');
    await expect(svc.collect('user-1', jobId, { timeoutMs: 0, ...clock() })).resolves.toEqual({
      status: 'timed_out',
      jobId,
    });
  });

  it('returns once a pending job is marked done', async () => {
    const { svc, gateway } = makeService();
    const { jobId } = gateway.start('user-1');
    let sleeps = 0;
    const ticks = clock();
    const out = await svc.collect('user-1', jobId, {
      fileName: 'Notes',
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
      now: ticks.now,
      sleep: async (ms) => {
        sleeps += 1;
        if (sleeps === 1) gateway.markDone(jobId, 'https://signed/late.pdf');
        await ticks.sleep(ms);
      },
    });
    expect(sleeps).toBe(1);
    expect(out).toEqual({
      status: 'done',
      assetUrl: 'https://signed/late.pdf',
      fileName: 'Notes.pdf',
    });
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
  });
});
