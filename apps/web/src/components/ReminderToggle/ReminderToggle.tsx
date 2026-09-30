import { useId } from 'react';
import { Bell } from 'lucide-react';
import { Icon } from '../Icon';
import { Copy, Input, Label, Root, Text } from './ReminderToggle.styles';

export interface ReminderToggleProps {
  /** Daily reminders are on when true. Default for a new envelope is on. */
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
  readonly disabled?: boolean | undefined;
}

/**
 * Per-envelope switch for the daily unsigned-signer reminder.
 * Mobile-first: the row is a full-width 44px target.
 */
export function ReminderToggle({ enabled, onChange, disabled = false }: ReminderToggleProps) {
  const hintId = useId();
  return (
    <Root>
      <Label>
        <Input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Text>
          <Icon icon={Bell} size={16} />
          Email reminders
        </Text>
      </Label>
      <Copy id={hintId}>Unsigned signers get a reminder about once a day.</Copy>
    </Root>
  );
}
