import type { SendReminderSettings } from '@/features/envelopes/sendReminderSettings';

export interface LocaleSettingsProps {
  /** Carries the chosen `locale` beside the reminder settings. */
  readonly value: SendReminderSettings;
  readonly onChange: (next: SendReminderSettings) => void;
  readonly disabled?: boolean | undefined;
}
