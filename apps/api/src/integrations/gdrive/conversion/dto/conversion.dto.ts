/**
 * Wire DTOs for the WT-D Drive doc → PDF conversion flow.
 *
 * These types are the public contract between the SPA and the API. They
 * are imported by both `conversion.controller.ts` and the WT-E React
 * client. Keep the literal field names + status strings stable — every
 * change here is a coordinated frontend + backend release.
 */
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Mime allow-list. Keep the exact strings — both the controller's
 * acceptance check and `conversion.service.ts`'s strategy switch read
 * from this set.
 */
export const ALLOWED_CONVERSION_MIMES = [
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type AllowedConversionMime = (typeof ALLOWED_CONVERSION_MIMES)[number];

/**
 * Request body for POST /integrations/gdrive/conversion. Class-validator
 * decorators run via the global ValidationPipe; the controller adds a
 * second mime-allow-list check so a wider DTO at any caller cannot
 * bypass the security guard.
 */
export class ConversionStartRequest {
  @IsUUID()
  readonly accountId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  readonly fileId!: string;

  /**
   * Mime type — validated against {@link ALLOWED_CONVERSION_MIMES} inside
   * the controller (NOT by class-validator) so we can return the
   * `unsupported-mime` error code shape instead of the generic
   * ValidationPipe 400.
   */
  @IsString()
  @MaxLength(128)
  readonly mimeType!: string;
}

export interface ConversionStartResponse {
  readonly jobId: string;
  readonly status: ConversionJobStatus;
}

export type ConversionJobStatus = 'pending' | 'converting' | 'done' | 'failed' | 'cancelled';

export interface ConversionJobView {
  readonly jobId: string;
  readonly status: ConversionJobStatus;
  /**
   * Storage object URL or signed URL of the converted PDF, only set when
   * status === 'done'. Lifetime is short — the SPA must consume it
   * promptly and store the result on its own envelope record.
   */
  readonly assetUrl?: string;
  /**
   * Named error code matching the WT-A-1 contract:
   *   'token-expired' | 'oauth-declined' | 'no-files-match-filter'
   *   | 'conversion-failed' | 'file-too-large' | 'unsupported-mime'
   * Only set when status === 'failed'.
   */
  readonly errorCode?:
    | 'token-expired'
    | 'oauth-declined'
    | 'no-files-match-filter'
    | 'conversion-failed'
    | 'file-too-large'
    | 'unsupported-mime';
}
