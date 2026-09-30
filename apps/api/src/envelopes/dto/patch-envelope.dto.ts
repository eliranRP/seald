import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PatchEnvelopeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title?: string;

  @IsOptional()
  @IsISO8601()
  readonly expires_at?: string;

  /**
   * User-defined labels for dashboard filtering. The service
   * lower-cases, trims, drops empties and de-duplicates before
   * persistence — clients can send the raw user-typed strings.
   * Capped at 10 entries × 32 chars each to keep dashboard rows
   * readable and prevent DoS via gigantic JSON blobs.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  readonly tags?: string[];

  /**
   * When false, the daily reminder sweep skips this envelope. Editable
   * while the envelope is a draft or awaiting signatures. Default is on.
   */
  @IsOptional()
  @IsBoolean()
  readonly reminders_enabled?: boolean;
}
