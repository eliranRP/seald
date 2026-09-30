import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import {
  ConversionBodyRequiredError,
  InvalidConversionAccountIdError,
  InvalidConversionFileIdError,
  UnsupportedConversionMimeError,
} from '../drive-import.service';
import { RateLimitedError } from '../rate-limiter';

/**
 * Maps `DriveImportService.start` failures onto the conversion route's
 * existing HTTP bodies. Unknown errors become `conversion-failed` and
 * the response never includes `err.message`.
 */
export function mapConversionStartHttpError(err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof ConversionBodyRequiredError) {
    return new BadRequestException('body_required');
  }
  if (err instanceof InvalidConversionAccountIdError) {
    return new BadRequestException({
      code: 'invalid-account-id',
      message: 'accountId_must_be_uuid',
    });
  }
  if (err instanceof InvalidConversionFileIdError) {
    return new BadRequestException({
      code: 'invalid-file-id',
      message: 'fileId_required',
    });
  }
  if (err instanceof UnsupportedConversionMimeError) {
    return new HttpException('unsupported-mime', HttpStatus.BAD_REQUEST);
  }
  if (err instanceof RateLimitedError) {
    return new HttpException(
      {
        code: 'rate-limited',
        message: 'rate-limited',
        retryAfter: Math.ceil(err.retryAfterMs / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  const rawCode = (err as { code?: string } | null)?.code;
  const codeMap: Record<string, { status: number }> = {
    'file-too-large': { status: HttpStatus.PAYLOAD_TOO_LARGE },
    'unsupported-mime': { status: HttpStatus.BAD_REQUEST },
    'token-expired': { status: HttpStatus.UNAUTHORIZED },
    'oauth-declined': { status: HttpStatus.FORBIDDEN },
    'conversion-failed': { status: HttpStatus.BAD_GATEWAY },
  };
  const code = rawCode && codeMap[rawCode] ? rawCode : 'conversion-failed';
  const status = codeMap[code]?.status ?? HttpStatus.BAD_GATEWAY;
  return new HttpException({ code, message: code }, status);
}
