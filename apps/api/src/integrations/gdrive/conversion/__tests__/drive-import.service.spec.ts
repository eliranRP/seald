import { ConversionGateway } from '../conversion.gateway';
import { ConversionService } from '../conversion.service';
import { DriveImportError, DriveImportService } from '../drive-import.service';
import type { GDriveService } from '../../gdrive.service';
import { GDriveRateLimiter } from '../../rate-limiter';
import { DriveRequestError } from '../../drive-request.errors';

const ACCOUNT = '00000000-0000-0000-0000-000000000aaa';
const PDF = 'application/pdf';

function make(opts?: { status?: number; capacity?: number }): {
  imp: DriveImportService;
  gateway: ConversionGateway;
} {
  const gateway = new ConversionGateway();
  const conversion = new ConversionService({
    driveFetcher: async () => ({
      ok: (opts?.status ?? 200) < 400,
      status: opts?.status ?? 200,
      body: Buffer.from('%PDF'),
      contentLength: 4,
    }),
    gotenbergClient: async () => ({ ok: true, status: 200, body: Buffer.from('%PDF') }),
    gateway,
    maxBytes: 1024,
    drive: {
      getAccessToken: async () => ({ accessToken: 'at', expiresAt: Date.now() + 3_600_000 }),
    } as unknown as GDriveService,
    assetWriter: async ({ jobId }) => ({ url: `https://signed.example/${jobId}.pdf` }),
    rateLimiter: new GDriveRateLimiter({ capacity: opts?.capacity ?? 30, windowMs: 60_000 }),
  });
  return { imp: new DriveImportService(conversion, gateway), gateway };
}

const base = { userId: 'user-1', accountId: ACCOUNT, fileId: 'file-1', mimeType: PDF };

describe('DriveImportService', () => {
  it('waits for the job and returns the signed asset url', async () => {
    const { imp } = make();
    const out = await imp.importFile({ ...base, pollIntervalMs: 5 });
    expect(out.assetUrl).toBe(`https://signed.example/${out.jobId}.pdf`);
  });

  it('surfaces a failed job as DriveImportError with the SPA error code', async () => {
    const { imp } = make({ status: 403 });
    const err = await imp.importFile({ ...base, pollIntervalMs: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveImportError);
    expect((err as DriveImportError).code).toBe('oauth-declined');
  });

  it('propagates start-time validation errors', async () => {
    const { imp } = make();
    await expect(imp.importFile({ ...base, fileId: '' })).rejects.toBeInstanceOf(DriveRequestError);
    await expect(imp.importFile({ ...base, accountId: 'x' })).rejects.toMatchObject({
      code: 'invalid-account-id',
    });
  });

  it('cancels the job when the caller aborts', async () => {
    const { imp, gateway } = make();
    const ctrl = new AbortController();
    ctrl.abort();
    const cancel = jest.spyOn(gateway, 'cancel');
    const err = await imp.importFile({ ...base, signal: ctrl.signal }).catch((e: unknown) => e);
    expect((err as DriveImportError).code).toBe('cancelled');
    expect(cancel).toHaveBeenCalled();
  });

  it('times out and cancels a stuck job', async () => {
    const { imp, gateway } = make();
    jest.spyOn(gateway, 'view').mockReturnValue({ jobId: 'j', status: 'converting' });
    const cancel = jest.spyOn(gateway, 'cancel');
    const err = await imp
      .importFile({ ...base, pollIntervalMs: 2, timeoutMs: 10 })
      .catch((e: unknown) => e);
    expect((err as DriveImportError).code).toBe('conversion-failed');
    expect(cancel).toHaveBeenCalled();
  });
});
