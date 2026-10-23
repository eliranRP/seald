import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EXPIRY_DEFAULT_DAYS,
  REMINDER_DEFAULTS,
  SETTINGS_DISPLAY_NAME_MAX,
  SETTINGS_IMAGE_MAX_CHARS,
  SETTINGS_TYPED_TEXT_MAX,
  SIGNATURE_TYPES,
  type ExpiryDefaultDays,
  type ReminderDefault,
  type SettingsSignatureType,
} from 'shared';

export class PatchSignatureDto {
  @IsOptional()
  @IsIn([...SIGNATURE_TYPES])
  readonly type?: SettingsSignatureType;

  @IsOptional()
  @IsString()
  @MaxLength(SETTINGS_TYPED_TEXT_MAX)
  readonly typed_text?: string | null;

  /** A PNG data URL, or null to clear. */
  @IsOptional()
  @IsString()
  @MaxLength(SETTINGS_IMAGE_MAX_CHARS)
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, {
    message: 'image must be a base64 PNG data URL',
  })
  readonly image?: string | null;
}

export class PatchNotifyDto {
  @IsOptional()
  @IsBoolean()
  readonly signed?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly daily_summary?: boolean;
}

export class PatchUserSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(SETTINGS_DISPLAY_NAME_MAX)
  readonly display_name?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchSignatureDto)
  readonly signature?: PatchSignatureDto;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  readonly initials?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchNotifyDto)
  readonly notify?: PatchNotifyDto;

  @IsOptional()
  @IsIn([...REMINDER_DEFAULTS])
  readonly reminder_default?: ReminderDefault;

  @IsOptional()
  @IsInt()
  @IsIn([...EXPIRY_DEFAULT_DAYS])
  readonly expiry_default_days?: ExpiryDefaultDays;
}
