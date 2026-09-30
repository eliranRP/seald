export interface ReminderToggleProps {
  /** Daily reminders are on when true. Default for a new envelope is on. */
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
  readonly disabled?: boolean | undefined;
}
