import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PatchEnvelopeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title?: string;

  @IsOptional()
  @IsISO8601()
  readonly expires_at?: string;
}
