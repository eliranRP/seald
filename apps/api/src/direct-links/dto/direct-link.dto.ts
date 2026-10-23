import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DIRECT_LINK_DAILY_CAP_MAX, DIRECT_LINK_SENDER_NAME_MAX } from 'shared';

/** `POST /templates/:id/direct-link` */
export class CreateDirectLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  readonly signer_slot!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DIRECT_LINK_DAILY_CAP_MAX)
  readonly daily_cap?: number;

  @IsOptional()
  @IsString()
  @MaxLength(DIRECT_LINK_SENDER_NAME_MAX)
  readonly sender_name?: string | null;
}

/** `PATCH /templates/:id/direct-link` */
export class UpdateDirectLinkDto {
  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  readonly signer_slot?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DIRECT_LINK_DAILY_CAP_MAX)
  readonly daily_cap?: number;

  @IsOptional()
  @IsString()
  @MaxLength(DIRECT_LINK_SENDER_NAME_MAX)
  readonly sender_name?: string | null;
}

/** `POST /direct-links/:token/claim` (public). No prefill: only these two fields. */
export class ClaimDirectLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name!: string;

  @IsEmail()
  @MaxLength(254)
  readonly email!: string;
}
