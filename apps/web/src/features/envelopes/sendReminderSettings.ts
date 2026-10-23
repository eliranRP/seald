import { DEFAULT_REMINDER_CADENCE, type ExpirySelection, type ReminderCadence } from 'shared';

/**
 * Sender-chosen expiry and reminder cadence for one send (WP-09). The
 * controls only render while `customReminders` is on. Defaults match the
 * values a draft already gets, so an untouched send is unchanged.
 */
export interface SendReminderSettings {
  readonly expiry: ExpirySelection;
  readonly cadence: ReminderCadence;
  /**
   * How date fields render (WP-08, flag `fieldMetaV2`): one of `DATE_FORMATS`
   * and an IANA timezone. Omitted keeps what the signer sent.
   */
  readonly dateFormat?: string | undefined;
  readonly timezone?: string | undefined;
  /** Envelope language (WP-38, flag `i18n`): one of `SUPPORTED_LOCALES`. */
  readonly locale?: string | undefined;
}

export const DEFAULT_SEND_REMINDER_SETTINGS: SendReminderSettings = {
  expiry: { kind: 'days', days: 30 },
  cadence: DEFAULT_REMINDER_CADENCE,
};
