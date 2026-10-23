import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SIGNER_AUTH_METHODS, type SignerAuthMethod } from 'shared';

export class SignerAccessAuthDto {
  @IsUUID()
  readonly signer_id!: string;

  /** `null` clears the override, so the signer inherits the envelope value. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(SIGNER_AUTH_METHODS)
  readonly access_auth?: SignerAuthMethod | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(SIGNER_AUTH_METHODS)
  readonly action_auth?: SignerAuthMethod | null;
}

/** `PATCH /envelopes/:id/access-auth` (mirrors PatchAccessAuthRequestSchema). */
export class PatchAccessAuthDto {
  @IsOptional()
  @IsIn(SIGNER_AUTH_METHODS)
  readonly access_auth?: SignerAuthMethod;

  @IsOptional()
  @IsIn(SIGNER_AUTH_METHODS)
  readonly action_auth?: SignerAuthMethod;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SignerAccessAuthDto)
  readonly signers?: SignerAccessAuthDto[];
}
