import { Injectable } from '@nestjs/common';
import { ConversionGateway } from './conversion.gateway';
import { ConversionService } from './conversion.service';
import type { ConversionJobView } from './dto/conversion.dto';

export interface DriveImportArgs {
  readonly userId: string;
  readonly accountId: string;
  readonly fileId: string;
  readonly mimeType: string;
  /** Poll cadence against the in-process job map. Default 500 ms. */
  readonly pollIntervalMs?: number;
  /** Give up and cancel the job after this long. Default 120 s. */
  readonly timeoutMs?: number;
  /** Caller-side cancellation (e.g. an MCP request abort). */
  readonly signal?: AbortSignal;
}

export interface DriveImportResult {
  readonly jobId: string;
  /** Short-lived signed URL of the converted PDF. */
  readonly assetUrl: string;
}

export type DriveImportErrorCode = NonNullable<ConversionJobView['errorCode']> | 'cancelled';

export class DriveImportError extends Error {
  constructor(public readonly code: DriveImportErrorCode) {
    super(code);
    this.name = 'DriveImportError';
  }
}

const DEFAULT_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Server-side replacement for the browser's `useDriveImport` loop: start a
 * Drive file -> PDF conversion and wait for the job to reach a terminal
 * state, so a non-browser caller (the MCP server) gets the finished PDF URL
 * in one call. Start-time validation, rate limiting and ownership checks
 * are those of {@link ConversionService.start}; its domain errors
 * propagate unchanged. Job failures surface as {@link DriveImportError}
 * carrying the same error vocabulary the SPA already renders.
 */
@Injectable()
export class DriveImportService {
  constructor(
    private readonly conversion: ConversionService,
    private readonly gateway: ConversionGateway,
  ) {}

  async importFile(args: DriveImportArgs): Promise<DriveImportResult> {
    const pollMs = args.pollIntervalMs ?? DEFAULT_POLL_MS;
    const deadline = Date.now() + (args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const { jobId } = await this.conversion.start({
      userId: args.userId,
      accountId: args.accountId,
      fileId: args.fileId,
      mimeType: args.mimeType,
    });
    for (;;) {
      if (args.signal?.aborted) {
        this.gateway.cancel(jobId, args.userId);
        throw new DriveImportError('cancelled');
      }
      const view = this.gateway.view(jobId, args.userId);
      if (!view) throw new DriveImportError('conversion-failed');
      if (view.status === 'done' && view.assetUrl) {
        return { jobId, assetUrl: view.assetUrl };
      }
      if (view.status === 'failed') {
        throw new DriveImportError(view.errorCode ?? 'conversion-failed');
      }
      if (view.status === 'cancelled') throw new DriveImportError('cancelled');
      if (Date.now() >= deadline) {
        this.gateway.cancel(jobId, args.userId);
        throw new DriveImportError('conversion-failed');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
