import { Injectable, Logger } from '@nestjs/common';
import { GDriveService } from '../gdrive.service';
import { GDriveError } from '../dto/error-codes';
import { ConversionGateway } from './conversion.gateway';
import {
  ALLOWED_CONVERSION_MIMES,
  type AllowedConversionMime,
  type ConversionJobView,
} from './dto/conversion.dto';

/**
 * Thin port over `fetch` so the unit suite can inject a fake. The real
 * production binding (see `conversion.module.ts`) wraps node fetch and
 * passes `signal` through. Using a port keeps the service free of
 * direct `fetch` calls — every network egress is under test control.
 */
export interface DriveFetcher {
  (args: {
    url: string;
    accessToken: string;
    signal?: AbortSignal;
  }): Promise<{ ok: boolean; status: number; body: Buffer; contentLength: number }>;
}

export const DRIVE_FETCHER = Symbol('DRIVE_FETCHER');

export interface GotenbergClient {
  (args: {
    fileBytes: Buffer;
    filename: string;
    signal?: AbortSignal;
  }): Promise<{ ok: boolean; status: number; body: Buffer }>;
}

export const GOTENBERG_CLIENT = Symbol('GOTENBERG_CLIENT');

export const CONVERSION_MAX_BYTES = Symbol('CONVERSION_MAX_BYTES');

/**
 * Result asset writer. Production wires this to the existing storage
 * module so the converted PDF lives next to envelope-attached assets;
 * tests inject a stub that returns a fixed URL.
 */
export interface ConversionAssetWriter {
  (args: { userId: string; jobId: string; bytes: Buffer }): Promise<{ url: string }>;
}

export const CONVERSION_ASSET_WRITER = Symbol('CONVERSION_ASSET_WRITER');

export interface ConvertOnceArgs {
  readonly accessToken: string;
  readonly fileId: string;
  readonly mimeType: string;
  readonly signal?: AbortSignal;
}

export interface StartArgs {
  readonly userId: string;
  readonly accountId: string;
  readonly fileId: string;
  readonly mimeType: string;
}

interface ServiceDeps {
  readonly driveFetcher: DriveFetcher;
  readonly gotenbergClient: GotenbergClient;
  readonly gateway: ConversionGateway;
  readonly maxBytes: number;
  readonly drive?: GDriveService;
  readonly assetWriter?: ConversionAssetWriter;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOC_MIME = 'application/vnd.google-apps.document';
const PDF_MIME = 'application/pdf';

/**
 * Drive-doc → PDF conversion service. Three branches:
 *   - PDF: `files.get(alt=media)` passthrough (still size-validated).
 *   - Doc: `files.export(mimeType=application/pdf)` (Drive renders
 *     server-side; cheaper than Gotenberg for native Docs).
 *   - .docx: download + post to Gotenberg's LibreOffice endpoint.
 *
 * Security guards (matched to `nodejs-security` skill checks):
 *   - mime allow-list at the entry point (defence in depth — the
 *     controller already pre-validates).
 *   - 25 MB size cap by content-length AND by accumulated body length.
 *   - AbortSignal propagated to BOTH downstream calls.
 *   - upstream error bodies are NOT echoed (bare error codes only).
 *   - access tokens never appear in logs (Logger reports fileId + mime,
 *     not the bearer).
 */
@Injectable()
export class ConversionService {
  private readonly logger = new Logger('ConversionService');
  private readonly fetcher: DriveFetcher;
  private readonly gotenberg: GotenbergClient;
  private readonly gateway: ConversionGateway;
  private readonly maxBytes: number;
  private readonly drive: GDriveService | undefined;
  private readonly assetWriter: ConversionAssetWriter | undefined;

  constructor(deps: ServiceDeps);
  constructor(
    drive: GDriveService,
    gateway: ConversionGateway,
    fetcher: DriveFetcher,
    gotenberg: GotenbergClient,
    maxBytes: number,
    assetWriter?: ConversionAssetWriter,
  );
  constructor(
    a: ServiceDeps | GDriveService,
    b?: ConversionGateway,
    c?: DriveFetcher,
    d?: GotenbergClient,
    e?: number,
    f?: ConversionAssetWriter,
  ) {
    if (isServiceDeps(a)) {
      this.fetcher = a.driveFetcher;
      this.gotenberg = a.gotenbergClient;
      this.gateway = a.gateway;
      this.maxBytes = a.maxBytes;
      this.drive = a.drive;
      this.assetWriter = a.assetWriter;
    } else {
      // DI ctor path — Nest passes positional providers.
      this.drive = a;
      // The remaining args are ordered for `useFactory` cleanliness.
      this.gateway = b as ConversionGateway;
      this.fetcher = c as DriveFetcher;
      this.gotenberg = d as GotenbergClient;
      this.maxBytes = e as number;
      this.assetWriter = f;
    }
  }

  /**
   * Pure conversion path used by the unit suite. Returns the converted
   * PDF bytes; does NOT touch the gateway or asset writer.
   */
  async convertOnce(args: ConvertOnceArgs): Promise<{ bytes: Buffer }> {
    if (!isAllowedMime(args.mimeType)) {
      throw new ConversionError('unsupported-mime', 'mime_not_in_allow_list');
    }
    const mime = args.mimeType;
    const signalArg = args.signal !== undefined ? { signal: args.signal } : {};

    if (mime === DOC_MIME) {
      const url = `${DRIVE_API}/files/${encodeURIComponent(
        args.fileId,
      )}/export?mimeType=${encodeURIComponent(PDF_MIME)}`;
      const resp = await this.fetcher({ url, accessToken: args.accessToken, ...signalArg });
      this.assertNotOversize(resp.contentLength);
      this.assertDriveOk(resp.status);
      this.assertBodySize(resp.body);
      return { bytes: resp.body };
    }

    if (mime === PDF_MIME) {
      const url = `${DRIVE_API}/files/${encodeURIComponent(args.fileId)}?alt=media`;
      const resp = await this.fetcher({ url, accessToken: args.accessToken, ...signalArg });
      this.assertNotOversize(resp.contentLength);
      this.assertDriveOk(resp.status);
      this.assertBodySize(resp.body);
      return { bytes: resp.body };
    }

    // mime === DOCX_MIME (only remaining branch given allow-list).
    const url = `${DRIVE_API}/files/${encodeURIComponent(args.fileId)}?alt=media`;
    const driveResp = await this.fetcher({
      url,
      accessToken: args.accessToken,
      ...signalArg,
    });
    this.assertNotOversize(driveResp.contentLength);
    this.assertDriveOk(driveResp.status);
    this.assertBodySize(driveResp.body);

    const gotResp = await this.gotenberg({
      fileBytes: driveResp.body,
      filename: `${args.fileId}.docx`,
      ...signalArg,
    });
    if (!gotResp.ok) {
      // Deliberately do NOT echo gotResp.body — see logger note above.
      this.logger.warn(`gotenberg_failed status=${gotResp.status} fileId=${args.fileId}`);
      throw new ConversionError('conversion-failed', `gotenberg_${gotResp.status}`);
    }
    this.assertBodySize(gotResp.body);
    return { bytes: gotResp.body };
  }

  /**
   * Controller-facing entrypoint. Orchestrates token retrieval, gateway
   * registration, and async background conversion. Returns immediately
   * with a `pending` jobId; the SPA polls GET /:jobId.
   */
  async start(args: StartArgs): Promise<{ jobId: string; status: 'pending' }> {
    if (!isAllowedMime(args.mimeType)) {
      throw new ConversionError('unsupported-mime', 'mime_not_in_allow_list');
    }
    const drive = this.requireDrive();
    const { jobId, signal } = this.gateway.start(args.userId);
    // Resolve a fresh access token. NotFoundException from getAccessToken
    // (account not owned) bubbles up — the controller maps it to 404.
    const { accessToken } = await drive.getAccessToken(args.accountId, args.userId, signal);
    // Fire-and-forget the conversion; the SPA polls for status.
    this.gateway.setStatus(jobId, 'converting');
    void this.runJob(jobId, accessToken, args, signal);
    return { jobId, status: 'pending' };
  }

  private async runJob(
    jobId: string,
    accessToken: string,
    args: StartArgs,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const { bytes } = await this.convertOnce({
        accessToken,
        fileId: args.fileId,
        mimeType: args.mimeType,
        signal,
      });
      const writer = this.assetWriter;
      if (!writer) {
        throw new ConversionError('conversion-failed', 'asset_writer_unwired');
      }
      const { url } = await writer({ userId: args.userId, jobId, bytes });
      this.gateway.markDone(jobId, url);
    } catch (err) {
      if (signal.aborted) return; // gateway already flipped to cancelled
      if (err instanceof ConversionError) {
        this.gateway.markFailed(jobId, err.code as NonNullable<ConversionJobView['errorCode']>);
        return;
      }
      if (err instanceof GDriveError) {
        const code = err.code === 'token-expired' ? 'token-expired' : 'oauth-declined';
        this.gateway.markFailed(jobId, code);
        return;
      }
      this.logger.error(`conversion_unhandled jobId=${jobId} err=${(err as Error).message}`);
      this.gateway.markFailed(jobId, 'conversion-failed');
    }
  }

  private assertNotOversize(contentLength: number): void {
    if (contentLength > this.maxBytes) {
      throw new ConversionError('file-too-large', `content_length_${contentLength}`);
    }
  }

  private assertBodySize(body: Buffer): void {
    if (body.length > this.maxBytes) {
      throw new ConversionError('file-too-large', `body_length_${body.length}`);
    }
  }

  private assertDriveOk(status: number): void {
    if (status === 401) throw new ConversionError('token-expired', 'drive_401');
    if (status === 403) throw new ConversionError('oauth-declined', 'drive_403');
    if (status >= 400) throw new ConversionError('conversion-failed', `drive_${status}`);
  }

  private requireDrive(): GDriveService {
    if (!this.drive) {
      throw new Error('GDriveService_not_wired_into_ConversionService');
    }
    return this.drive;
  }
}

/**
 * Locally-thrown error. Has a stable `code` matching the WT-A-1
 * contract; the controller maps it to HTTP status. Kept distinct from
 * `GDriveError` so the unit suite can pin codes without dragging the
 * full token-issuer stack.
 */
export class ConversionError extends Error {
  constructor(
    public readonly code:
      | 'token-expired'
      | 'oauth-declined'
      | 'no-files-match-filter'
      | 'conversion-failed'
      | 'file-too-large'
      | 'unsupported-mime',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ConversionError';
  }
}

function isAllowedMime(mime: string): mime is AllowedConversionMime {
  return (ALLOWED_CONVERSION_MIMES as readonly string[]).includes(mime);
}

function isServiceDeps(v: unknown): v is ServiceDeps {
  return (
    typeof v === 'object' &&
    v !== null &&
    'driveFetcher' in v &&
    'gotenbergClient' in v &&
    'gateway' in v &&
    'maxBytes' in v
  );
}
