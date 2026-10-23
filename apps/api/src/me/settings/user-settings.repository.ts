import type { UserSettings } from 'shared';

/** Port for `user_settings` (migration 0043). One row per user. */
export abstract class UserSettingsRepository {
  /** The saved settings, or null when the user never saved any. */
  abstract find(userId: string): Promise<UserSettings | null>;
  /** Insert or replace the user's row with the full settings. */
  abstract save(userId: string, settings: UserSettings): Promise<void>;
}
