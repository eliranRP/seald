import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  CONVERSION_MAX_BYTES,
  GOTENBERG_CLIENT,
  type GotenbergClient,
} from '../integrations/gdrive/conversion/conversion.service';
import { detectStagedFileKind } from './file-type';

/** Give up on a local conversion after 25 seconds (same limit as MCP uploads). */
const CONVERSION_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/** Legacy binary Word (.doc) is an OLE compound file. */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export type LocalUploadKind = 'pdf' | 'docx' | 'doc';

export function detectLocalUploadKind(bytes: Buffer): LocalUploadKind | null {
  const kind = detectStagedFileKind(bytes);
  if (kind) return kind;
  if (bytes.length >= OLE_MAGIC.length && bytes.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) {
    return 'doc';
  }
  return null;
}

/**
 * Turns a file picked on the upload screen into PDF bytes. A PDF passes
 * through, Word (.docx/.doc) goes to the Gotenberg sidecar, anything else
 * is refused with 415. Oversized input or output is refused with 413.
 */
@Injectable()
export class LocalConvertService {
  private readonly log = new Logger('LocalConvertService');
  private readonly maxBytes: number;

  constructor(
    @Optional() @Inject(GOTENBERG_CLIENT) private readonly gotenberg?: GotenbergClient,
    @Optional() @Inject(CONVERSION_MAX_BYTES) maxBytes?: number,
  ) {
    this.maxBytes = maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async toPdf(bytes: Buffer): Promise<{ pdf: Buffer; converted: boolean }> {
    if (bytes.length > this.maxBytes) throw new PayloadTooLargeException('file_too_large');
    const kind = detectLocalUploadKind(bytes);
    if (kind === null) throw new UnsupportedMediaTypeException('unsupported_file_type');
    if (kind === 'pdf') return { pdf: bytes, converted: false };
    return { pdf: await this.convert(bytes, kind), converted: true };
  }

  private async convert(bytes: Buffer, kind: 'docx' | 'doc'): Promise<Buffer> {
    if (!this.gotenberg) throw new ServiceUnavailableException('conversion_unavailable');
    let res: { ok: boolean; status: number; body: Buffer };
    try {
      res = await this.gotenberg({
        fileBytes: bytes,
        filename: `upload.${kind}`,
        signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new GatewayTimeoutException('conversion_timeout');
      }
      throw new BadGatewayException('conversion_failed');
    }
    if (!res.ok) {
      this.log.warn(`local-convert: gotenberg status=${String(res.status)}`);
      throw new BadGatewayException('conversion_failed');
    }
    if (res.body.length > this.maxBytes) throw new PayloadTooLargeException('file_too_large');
    return res.body;
  }
}
