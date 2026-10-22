import { IsString, MaxLength, MinLength } from 'class-validator';
import { isSupportedLocale, SUPPORTED_LOCALES } from 'shared';
import { FlagGatedProperty } from '../../common/flag-gated.validators';

export class CreateEnvelopeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title!: string;

  /** Signing-experience and email locale (WP-38). Flag off: rejected like an unknown property. */
  @FlagGatedProperty(
    'i18n',
    (v) => typeof v === 'string' && isSupportedLocale(v),
    (p) => `${p} must be one of the following values: ${SUPPORTED_LOCALES.join(', ')}`,
  )
  readonly locale?: string;
}
