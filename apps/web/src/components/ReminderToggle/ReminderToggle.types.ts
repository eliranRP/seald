import type { ReminderCadence } from 'shared';

export interface ReminderToggleProps {
  /** Daily reminders are on when true. Default for a new envelope is on. */
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
  readonly disabled?: boolean | undefined;
  /** True while a save is in flight. The switch keeps the optimistic value and ignores further clicks. */
  readonly pending?: boolean | undefined;
  /** Reminder schedule for the help text. Omitted or default keeps the standard wording. */
  readonly cadence?: ReminderCadence | undefined;
}
