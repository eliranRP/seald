import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Body for POST /sign/fields/:field_id — fills one non-signature field.
 * `signature` and `initials` kinds use /sign/signature instead, because they
 * carry an image payload and a different upload path.
 *
 * At least one of value_text / value_boolean must be provided — the service
 * enforces the "right field for right kind" mapping (date/text/email take
 * value_text; checkbox takes value_boolean).
 */
export class FillFieldDto {
  @ValidateIf((o: FillFieldDto) => o.value_boolean === undefined)
  @IsString()
  @MaxLength(500)
  readonly value_text?: string;

  @ValidateIf((o: FillFieldDto) => o.value_text === undefined)
  @IsOptional()
  @IsBoolean()
  readonly value_boolean?: boolean;
}
