import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { isSupportedLocale, SUPPORTED_LOCALES } from 'shared';
import { FlagGatedProperty } from '../../common/flag-gated.validators';

/**
 * AddSignerDto accepts one of two payload shapes:
 *
 *   1. Contact-backed: `{ contact_id: <uuid> }`     — sender selects a saved contact.
 *   2. Ad-hoc:        `{ email, name, color? }`    — guest mode synthesises a signer
 *                                                     locally (UploadRoute.synthLocalSigner)
 *                                                     and never persists a contact row.
 *
 * `@ValidateIf` toggles each branch's validators based on which keys were sent.
 * If neither shape is fully present, every required validator fires and the request
 * is rejected with a descriptive error list (no silent fallthrough).
 */
export class AddSignerDto {
  @ValidateIf((o: AddSignerDto) => o.contact_id !== undefined || (!o.email && !o.name))
  @IsUUID()
  readonly contact_id?: string;

  @ValidateIf((o: AddSignerDto) => o.contact_id === undefined)
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  readonly email?: string;

  @ValidateIf((o: AddSignerDto) => o.contact_id === undefined)
  @IsString()
  @Length(1, 200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  readonly name?: string;

  @IsOptional()
  @IsHexColor()
  readonly color?: string;

  /** Per-signer locale override (WP-38). Flag off: rejected like an unknown property. */
  @FlagGatedProperty(
    'i18n',
    (v) => typeof v === 'string' && isSupportedLocale(v),
    (p) => `${p} must be one of the following values: ${SUPPORTED_LOCALES.join(', ')}`,
  )
  readonly locale?: string;
}
