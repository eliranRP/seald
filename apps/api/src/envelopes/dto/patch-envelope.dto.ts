import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  DATE_FORMATS,
  isDateFormat,
  isFeatureEnabled,
  isValidTimeZone,
  REMINDER_CADENCE_BOUNDS,
} from 'shared';
import { FlagGatedProperty } from '../../common/flag-gated.validators';
import { IsExpiryInBounds } from './reminder-settings.validators';

export class PatchEnvelopeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title?: string;

  /**
   * Draft only. While `customReminders` is on the value must be between one
   * day and 90 days from now (see IsExpiryInBounds).
   */
  @IsOptional()
  @IsISO8601()
  @IsExpiryInBounds()
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

  /*
   * Reminder cadence (WP-09). Bounds apply only while `customReminders` is
   * on. While it is off the validators are skipped, and the service rejects
   * the keys, so the request fails the same way it did before the field
   * existed.
   */
  @IsOptional()
  @ValidateIf(() => isFeatureEnabled('customReminders'))
  @IsInt()
  @Min(REMINDER_CADENCE_BOUNDS.firstAfterDays.min)
  @Max(REMINDER_CADENCE_BOUNDS.firstAfterDays.max)
  readonly reminder_first_after_days?: number;

  @IsOptional()
  @ValidateIf(() => isFeatureEnabled('customReminders'))
  @IsInt()
  @Min(REMINDER_CADENCE_BOUNDS.intervalDays.min)
  @Max(REMINDER_CADENCE_BOUNDS.intervalDays.max)
  readonly reminder_interval_days?: number;

  @IsOptional()
  @ValidateIf(() => isFeatureEnabled('customReminders'))
  @IsInt()
  @Min(REMINDER_CADENCE_BOUNDS.maxReminders.min)
  @Max(REMINDER_CADENCE_BOUNDS.maxReminders.max)
  readonly reminder_max?: number;

  /**
   * How date fields render (WP-07, migration 0024). Draft only. Flag off:
   * rejected like any unknown property.
   */
  @FlagGatedProperty(
    'fieldMetaV2',
    isDateFormat,
    (p) => `${p} must be one of the following values: ${DATE_FORMATS.join(', ')}`,
  )
  readonly date_format?: string;

  /** IANA timezone for date fields (WP-07). Draft only. */
  @FlagGatedProperty(
    'fieldMetaV2',
    (v) => typeof v === 'string' && v.length <= 64 && isValidTimeZone(v),
    (p) => `${p} must be an IANA timezone such as Europe/Berlin`,
  )
  readonly timezone?: string;
}
