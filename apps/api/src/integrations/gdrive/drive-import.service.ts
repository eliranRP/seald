import { Injectable } from '@nestjs/common';
import { GDriveRateLimiter } from './rate-limiter';
import { ConversionService } from './conversion/conversion.service';
import {
  ALLOWED_CONVERSION_MIMES,
  type ConversionStartResponse,
} from './conversion/dto/conversion.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME: ReadonlySet<string> = new Set(ALLOWED_CONVERSION_MIMES);

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

/** Arguments for {@link DriveImportService.start}. The HTTP body stays in the controller. */
export interface DriveImportStartInput {
  readonly accountId: string;
  readonly fileId: string;
  readonly mimeType: string;
}

/**
 * Starts a Drive → PDF conversion. Validation failures and
 * `RateLimitedError` propagate as domain errors. HTTP mapping lives in
 * `conversion/conversion.http-errors.ts`. A missing request body is
 * `body_required` on the conversion controller, not here.
 */
@Injectable()
export class DriveImportService {
  constructor(
    private readonly conversion: ConversionService,
    private readonly rateLimiter: GDriveRateLimiter,
  ) {}

  async start(userId: string, input: DriveImportStartInput): Promise<ConversionStartResponse> {
    const { accountId, fileId, mimeType } = input;
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
}
