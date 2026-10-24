/** Wire contract of `GET`/`PATCH /me/settings` (the sender's own preferences). */

export const REMINDER_DEFAULTS = ['off', '2d', '3d', 'weekly'] as const;
export type ReminderDefault = (typeof REMINDER_DEFAULTS)[number];

export const EXPIRY_DEFAULT_DAYS = [7, 14, 30, 60] as const;
export type ExpiryDefaultDays = (typeof EXPIRY_DEFAULT_DAYS)[number];

export const SIGNATURE_TYPES = ['typed', 'drawn', 'uploaded'] as const;
export type SettingsSignatureType = (typeof SIGNATURE_TYPES)[number];

/** Largest saved signature or initials image, as a PNG data URL. */
export const SETTINGS_IMAGE_MAX_CHARS = 200_000;
export const SETTINGS_DISPLAY_NAME_MAX = 120;
export const SETTINGS_TYPED_TEXT_MAX = 80;

export interface UserSettingsSignature {
  readonly type: SettingsSignatureType;
  readonly typed_text: string | null;
  /** PNG data URL when `type` is `drawn` or `uploaded`, else null. */
  readonly image: string | null;
}

export interface UserSettings {
  readonly display_name: string | null;
  readonly signature: UserSettingsSignature;
  /** Typed initials, up to 6 characters. */
  readonly initials: string | null;
  readonly notify: {
    /** Email me when someone signs. */
    readonly signed: boolean;
    /** One morning email with what needs me. */
    readonly daily_summary: boolean;
  };
  readonly reminder_default: ReminderDefault;
  readonly expiry_default_days: ExpiryDefaultDays;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  display_name: null,
  signature: { type: 'typed', typed_text: null, image: null },
  initials: null,
  notify: { signed: true, daily_summary: false },
  reminder_default: '3d',
  expiry_default_days: 30,
};
