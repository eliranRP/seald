import type { ReactNode } from 'react';
import type { ExpirySelection, ReminderCadence } from 'shared';

export interface SendOptionsRecipient {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export type ReminderChoice = 'off' | 'every3' | 'weekly';

export interface SendOptionsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** "Send now" (or "Sign now" when only the sender signs). */
  readonly onSend: () => void;
  readonly sendLabel?: string | undefined;
  readonly recipients: ReadonlyArray<SendOptionsRecipient>;
  /** Signers sign one after another. */
  readonly ordered?: boolean | undefined;

  readonly remindersEnabled: boolean;
  readonly onRemindersEnabledChange: (enabled: boolean) => void;
  readonly cadence: ReminderCadence;
  readonly onCadenceChange: (next: ReminderCadence) => void;
  readonly expiry: ExpirySelection;
  readonly onExpiryChange: (next: ExpirySelection) => void;

  /** Extra controls under "More options" (date format, language, access code…). */
  readonly advanced?: ReactNode;
}
