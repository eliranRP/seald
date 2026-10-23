import type { SendReminderSettings } from '@/features/envelopes/sendReminderSettings';

export interface SendSettingsProps {
  /** Current expiry and reminder cadence for this send. */
  readonly value: SendReminderSettings;
  readonly onChange: (next: SendReminderSettings) => void;
  readonly disabled?: boolean | undefined;
  /** Clock for the date picker bounds. Defaults to now. */
  readonly nowMs?: number | undefined;
}
