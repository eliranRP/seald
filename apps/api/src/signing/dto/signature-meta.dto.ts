import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SIGNATURE_FORMATS, type SignatureFormat } from 'shared';

/**
 * Multipart body fields alongside the `image` file upload for
 * POST /sign/signature. The file itself is not a class-validator concern —
 * Multer + the service enforce size, MIME and magic-byte checks.
 *
 * Multer parses multipart body fields as strings, so `stroke_count` needs an
 * explicit `@Type(() => Number)` to survive the class-transformer pass before
 * @IsInt runs.
 */
const SIGNATURE_KINDS = ['signature', 'initials'] as const;
type SignatureKind = (typeof SIGNATURE_KINDS)[number];

export class SignatureMetaDto {
  @IsIn(SIGNATURE_FORMATS as unknown as string[])
  readonly format!: SignatureFormat;

  /**
   * Discriminates whether the upload is the signer's full signature or
   * just their initials. Optional for backward compatibility with older
   * web clients that only ever uploaded one image — server treats the
   * absent field as 'signature' to preserve prior behaviour.
   */
  @IsOptional()
  @IsIn(SIGNATURE_KINDS as unknown as string[])
  readonly kind?: SignatureKind;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly font?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  readonly stroke_count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly source_filename?: string;
}
