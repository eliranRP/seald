import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DELIVERY_MODES, MAX_SIGNING_ORDER, type DeliveryMode } from 'shared';

export class SignerOrderDto {
  @IsUUID()
  readonly signer_id!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SIGNING_ORDER)
  readonly signing_order!: number;
}

/**
 * `PUT /envelopes/:id/signing-order` (WP-05). Mirrors
 * SetSigningOrderRequestSchema. `signers`, when given, must name every
 * signer of the envelope exactly once (checked by the service).
 */
export class SetSigningOrderDto {
  @IsIn(DELIVERY_MODES)
  readonly delivery_mode!: DeliveryMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SIGNING_ORDER)
  @ValidateNested({ each: true })
  @Type(() => SignerOrderDto)
  readonly signers?: SignerOrderDto[];
}
