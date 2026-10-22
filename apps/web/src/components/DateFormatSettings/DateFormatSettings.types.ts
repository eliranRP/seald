import type { SendReminderSettings } from '@/features/envelopes/sendReminderSettings';

export interface DateFormatSettingsProps {
  /** Carries the chosen `dateFormat` and `timezone` beside the reminder settings. */
  readonly value: SendReminderSettings;
  readonly onChange: (next: SendReminderSettings) => void;
  readonly disabled?: boolean | undefined;
  /** Clock for the preview line. Defaults to now. */
  readonly nowMs?: number | undefined;
}
