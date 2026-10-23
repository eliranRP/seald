import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_SETTINGS, type UserSettings } from 'shared';
import { UserSettingsRepository } from './user-settings.repository';
import type { PatchUserSettingsDto } from './dto/patch-user-settings.dto';

function clean(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class UserSettingsService {
  constructor(private readonly repo: UserSettingsRepository) {}

  /** The saved settings, or the defaults when the user never saved any. */
  async get(userId: string): Promise<UserSettings> {
    return (await this.repo.find(userId)) ?? DEFAULT_USER_SETTINGS;
  }

  async patch(userId: string, dto: PatchUserSettingsDto): Promise<UserSettings> {
    const current = await this.get(userId);
    const sig = dto.signature;
    const next: UserSettings = {
      display_name:
        dto.display_name === undefined ? current.display_name : (clean(dto.display_name) ?? null),
      signature: sig
        ? {
            type: sig.type ?? current.signature.type,
            typed_text:
              sig.typed_text === undefined
                ? current.signature.typed_text
                : (clean(sig.typed_text) ?? null),
            image: sig.image === undefined ? current.signature.image : sig.image,
          }
        : current.signature,
      initials: dto.initials === undefined ? current.initials : (clean(dto.initials) ?? null),
      notify: {
        signed: dto.notify?.signed ?? current.notify.signed,
        daily_summary: dto.notify?.daily_summary ?? current.notify.daily_summary,
      },
      reminder_default: dto.reminder_default ?? current.reminder_default,
      expiry_default_days: dto.expiry_default_days ?? current.expiry_default_days,
    };
    // A typed signature carries no image.
    const normalized: UserSettings =
      next.signature.type === 'typed' && next.signature.image !== null
        ? { ...next, signature: { ...next.signature, image: null } }
        : next;
    await this.repo.save(userId, normalized);
    return normalized;
  }
}
