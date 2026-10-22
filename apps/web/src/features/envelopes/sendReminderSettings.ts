import { DEFAULT_REMINDER_CADENCE, type ExpirySelection, type ReminderCadence } from 'shared';

/**
 * Sender-chosen expiry and reminder cadence for one send (WP-09). The
 * controls only render while `customReminders` is on. Defaults match the
 * values a draft already gets, so an untouched send is unchanged.
 */
export interface SendReminderSettings {
  readonly expiry: ExpirySelection;
  readonly cadence: ReminderCadence;
}

export const DEFAULT_SEND_REMINDER_SETTINGS: SendReminderSettings = {
  expiry: { kind: 'days', days: 30 },
  cadence: DEFAULT_REMINDER_CADENCE,
};
