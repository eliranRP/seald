import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { FEATURE_FLAGS } from 'shared';
import type { AuthUser } from '../../../../auth/auth-user';
import { ConversionController } from '../conversion.controller';
import { ConversionGateway } from '../conversion.gateway';
import { ConversionService } from '../conversion.service';
import { GDriveRateLimiter, RateLimitedError } from '../../rate-limiter';

class FakeService {
  startCalls: Array<{ accountId: string; fileId: string; mimeType: string; userId: string }> = [];
  startImpl: (args: {
    accountId: string;
    fileId: string;
    mimeType: string;
    userId: string;
  }) => Promise<{ jobId: string; status: 'pending' }> = async (args) => {
    this.startCalls.push(args);
    return { jobId: 'job-1', status: 'pending' as const };
  };
  start = (args: {
    accountId: string;
    fileId: string;
    mimeType: string;
    userId: string;
  }): Promise<{ jobId: string; status: 'pending' }> => this.startImpl(args);
}

const USER_1: AuthUser = { id: 'user-1', email: 'u1@example.com', provider: 'google' };

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000aaa';
const FILE_ID = '1AbCdEf-GhIj';

function makeCtrl(opts?: { capacity?: number; windowMs?: number }): {
  ctrl: ConversionController;
  svc: FakeService;
  gateway: ConversionGateway;
  limiter: GDriveRateLimiter;
} {
  const svc = new FakeService();
  const gateway = new ConversionGateway();
  const limiter = new GDriveRateLimiter({
    capacity: opts?.capacity ?? 30,
    windowMs: opts?.windowMs ?? 60_000,
  });
  const ctrl = new ConversionController(svc as unknown as ConversionService, gateway, limiter);
  return { ctrl, svc, gateway, limiter };
}

describe('ConversionController', () => {
  beforeEach(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = true;
  });
  afterAll(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
  });

  describe('feature flag gating', () => {
    it('POST /conversion → 404 when flag is off', async () => {
      (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
      const { ctrl } = makeCtrl();
      await expect(
        ctrl.start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /conversion/:jobId → 404 when flag is off', async () => {
      (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
      const { ctrl } = makeCtrl();
      await expect(ctrl.poll(USER_1, 'any-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('DELETE /conversion/:jobId → 404 when flag is off', async () => {
      (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
      const { ctrl } = makeCtrl();
      await expect(ctrl.cancel(USER_1, 'any-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('POST /conversion', () => {
    it('happy path: forwards to service, returns { jobId, status }', async () => {
      const { ctrl, svc } = makeCtrl();
      const out = await ctrl.start(USER_1, {
        accountId: ACCOUNT_ID,
        fileId: FILE_ID,
        mimeType: 'application/pdf',
      });
      expect(out).toEqual({ jobId: 'job-1', status: 'pending' });
      expect(svc.startCalls).toHaveLength(1);
      expect(svc.startCalls[0]?.userId).toBe('user-1');
    });

    it('rejects 400 when accountId is not a UUID', async () => {
      const { ctrl } = makeCtrl();
      await expect(
        ctrl.start(USER_1, {
          accountId: 'not-a-uuid',
          fileId: FILE_ID,
          mimeType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects 400 unsupported-mime when mimeType is not in the allow-list', async () => {
      const { ctrl } = makeCtrl();
      const err = await ctrl
        .start(USER_1, {
          accountId: ACCOUNT_ID,
          fileId: FILE_ID,
          mimeType: 'image/png',
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      // Either the structured `{ code, message }` form (mapStartError) or
      // the bare string form (controller pre-flight) is acceptable — the
      // global HttpExceptionFilter normalises both to `{ error: '<code>' }`
      // over the wire (asserted in the e2e suite).
      const resp = (err as HttpException).getResponse();
      const codeOrString = typeof resp === 'string' ? resp : (resp as { code?: string }).code;
      expect(codeOrString).toBe('unsupported-mime');
    });

    it('rejects 400 when fileId is empty', async () => {
      const { ctrl } = makeCtrl();
      await expect(
        ctrl.start(USER_1, { accountId: ACCOUNT_ID, fileId: '', mimeType: 'application/pdf' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rate-limit: invokes per-user limiter; 429 with retryAfter on overflow', async () => {
      const { ctrl } = makeCtrl({ capacity: 1, windowMs: 60_000 });
      await ctrl.start(USER_1, {
        accountId: ACCOUNT_ID,
        fileId: FILE_ID,
        mimeType: 'application/pdf',
      });
      const err = await ctrl
        .start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const resp = (err as HttpException).getResponse() as { code?: string; retryAfter?: number };
      expect(resp.code).toBe('rate-limited');
      expect(typeof resp.retryAfter).toBe('number');
    });

    it('maps service file-too-large → HTTP 413', async () => {
      const { ctrl, svc } = makeCtrl();
      svc.startImpl = async () => {
        const err: Error & { code?: string } = new Error('too large');
        err.code = 'file-too-large';
        throw err;
      };
      const err = await ctrl
        .start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'file-too-large' });
    });

    it('maps service token-expired → HTTP 401 token-expired', async () => {
      const { ctrl, svc } = makeCtrl();
      svc.startImpl = async () => {
        const err: Error & { code?: string } = new Error('token gone');
        err.code = 'token-expired';
        throw err;
      };
      const err = await ctrl
        .start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' })
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'token-expired' });
    });

    it('does not echo access tokens or upstream errors in the response body', async () => {
      const { ctrl, svc } = makeCtrl();
      svc.startImpl = async () => {
        throw new Error('upstream said: at-secret-token-99');
      };
      const err = await ctrl
        .start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      const resp = (err as HttpException).getResponse();
      expect(JSON.stringify(resp)).not.toContain('at-secret-token-99');
    });
  });

  describe('GET /conversion/:jobId', () => {
    it('returns the job view when owned by the caller', async () => {
      const { ctrl, gateway } = makeCtrl();
      const { jobId } = gateway.start('user-1');
      gateway.markDone(jobId, 'https://signed/x.pdf');
      const out = await ctrl.poll(USER_1, jobId);
      expect(out).toEqual({ jobId, status: 'done', assetUrl: 'https://signed/x.pdf' });
    });

    it('returns 404 when the job does not exist OR belongs to another user', async () => {
      const { ctrl, gateway } = makeCtrl();
      const { jobId } = gateway.start('user-2');
      await expect(ctrl.poll(USER_1, jobId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(ctrl.poll(USER_1, 'unknown-job')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('DELETE /conversion/:jobId', () => {
    it('cancels the job (aborts the controller) when owned by the caller', async () => {
      const { ctrl, gateway } = makeCtrl();
      const { jobId, signal } = gateway.start('user-1');
      await ctrl.cancel(USER_1, jobId);
      expect(signal.aborted).toBe(true);
      expect(gateway.get(jobId)?.status).toBe('cancelled');
    });

    it('returns 404 when the job belongs to another user (no existence leak)', async () => {
      const { ctrl, gateway } = makeCtrl();
      const { jobId, signal } = gateway.start('user-2');
      await expect(ctrl.cancel(USER_1, jobId)).rejects.toBeInstanceOf(NotFoundException);
      expect(signal.aborted).toBe(false);
    });
  });

  it('rate-limit error is caught from limiter explicitly (not swallowed)', async () => {
    // Belt-and-braces: ensure the controller really wraps RateLimitedError into 429.
    const { ctrl, limiter } = makeCtrl({ capacity: 100, windowMs: 60_000 });
    jest.spyOn(limiter, 'acquire').mockImplementationOnce(async () => {
      throw new RateLimitedError(12_345);
    });
    const err = await ctrl
      .start(USER_1, { accountId: ACCOUNT_ID, fileId: FILE_ID, mimeType: 'application/pdf' })
      .catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    const body = (err as HttpException).getResponse() as { retryAfter?: number };
    expect(body.retryAfter).toBe(13);
  });
});
