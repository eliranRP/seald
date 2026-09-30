import { Injectable } from '@nestjs/common';
import { driveImportStep, pdfFileNameForDriveImport, type DriveImportErrorCode } from 'shared';
import { GDriveRateLimiter } from './rate-limiter';
import { ConversionGateway } from './conversion/conversion.gateway';
import { ConversionService } from './conversion/conversion.service';
import {
  ALLOWED_CONVERSION_MIMES,
  type ConversionStartResponse,
} from './conversion/dto/conversion.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME: ReadonlySet<string> = new Set(ALLOWED_CONVERSION_MIMES);

/** Default wait for a future import tool. Not an HTTP timeout. */
export const DRIVE_IMPORT_COLLECT_TIMEOUT_MS = 25_000;
const DEFAULT_POLL_MS = 1_500;

export class ConversionBodyRequiredError extends Error {
  constructor() {
    super('body_required');
    this.name = 'ConversionBodyRequiredError';
  }
}

export class InvalidConversionAccountIdError extends Error {
  readonly code = 'invalid-account-id' as const;
  constructor() {
    super('accountId_must_be_uuid');
    this.name = 'InvalidConversionAccountIdError';
  }
}

export class InvalidConversionFileIdError extends Error {
  readonly code = 'invalid-file-id' as const;
  constructor() {
    super('fileId_required');
    this.name = 'InvalidConversionFileIdError';
  }
}

export class UnsupportedConversionMimeError extends Error {
  readonly code = 'unsupported-mime' as const;
  constructor() {
    super('unsupported-mime');
    this.name = 'UnsupportedConversionMimeError';
  }
}

export type DriveImportCollectResult =
  | { readonly status: 'done'; readonly assetUrl: string; readonly fileName: string }
  | { readonly status: 'failed'; readonly errorCode: DriveImportErrorCode }
  | { readonly status: 'cancelled' }
  | { readonly status: 'timed_out'; readonly jobId: string };

export interface DriveImportCollectOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly fileName?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

function readBody(body: unknown): {
  accountId: unknown;
  fileId: unknown;
  mimeType: unknown;
} {
  if (!body || typeof body !== 'object') throw new ConversionBodyRequiredError();
  const record = body as { accountId?: unknown; fileId?: unknown; mimeType?: unknown };
  return {
    accountId: record.accountId,
    fileId: record.fileId,
    mimeType: record.mimeType,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Starts a Drive → PDF conversion and, for a future import tool, waits
 * for the in-memory job. Validation failures and `RateLimitedError`
 * propagate as domain errors. HTTP mapping lives in
 * `conversion/conversion.http-errors.ts`. `collect` is not mounted on a
 * route.
 */
@Injectable()
export class DriveImportService {
  constructor(
    private readonly conversion: ConversionService,
    private readonly rateLimiter: GDriveRateLimiter,
    private readonly gateway: ConversionGateway,
  ) {}

  async start(userId: string, body: unknown): Promise<ConversionStartResponse> {
    const { accountId, fileId, mimeType } = readBody(body);
    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
      throw new InvalidConversionAccountIdError();
    }
    if (typeof fileId !== 'string' || fileId.length === 0 || fileId.length > 256) {
      throw new InvalidConversionFileIdError();
    }
    if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
      throw new UnsupportedConversionMimeError();
    }
    await this.rateLimiter.acquire(userId);
    return this.conversion.start({ userId, accountId, fileId, mimeType });
  }

  /**
   * Poll the conversion gateway until the job is terminal or `timeoutMs`
   * elapses. A missing job is `failed` / `conversion-failed`. `done`
   * without an asset URL keeps waiting, matching the browser hook.
   */
  async collect(
    userId: string,
    jobId: string,
    opts?: DriveImportCollectOptions,
  ): Promise<DriveImportCollectResult> {
    const timeoutMs = opts?.timeoutMs ?? DRIVE_IMPORT_COLLECT_TIMEOUT_MS;
    const pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_POLL_MS;
    const now = opts?.now ?? Date.now;
    const sleep = opts?.sleep ?? delay;
    const fileName = pdfFileNameForDriveImport(opts?.fileName ?? 'document');
    const deadline = now() + timeoutMs;

    for (;;) {
      const view = this.gateway.view(jobId, userId);
      if (!view) return { status: 'failed', errorCode: 'conversion-failed' };
      const step = driveImportStep(view);
      if (step.kind === 'done') {
        return { status: 'done', assetUrl: step.assetUrl, fileName };
      }
      if (step.kind === 'failed') return { status: 'failed', errorCode: step.errorCode };
      if (step.kind === 'cancelled') return { status: 'cancelled' };
      const remaining = deadline - now();
      if (remaining <= 0) return { status: 'timed_out', jobId };
      await sleep(Math.min(pollIntervalMs, remaining));
    }
  }
}
