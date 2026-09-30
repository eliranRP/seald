import { useId } from 'react';
import { Bell } from 'lucide-react';
import { Icon } from '../Icon';
import { Copy, CopyCol, Input, Root, Text } from './ReminderToggle.styles';
import type { ReminderToggleProps } from './ReminderToggle.types';

/**
 * Per-envelope switch for the daily unsigned-signer reminder.
 * Mobile-first: the row is a full-width 44px target.
 */
export function ReminderToggle({
  enabled,
  onChange,
  disabled = false,
  pending = false,
}: ReminderToggleProps) {
  const inputId = useId();
  const hintId = useId();
  return (
    <Root>
      <Input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={enabled}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <CopyCol>
        <Text htmlFor={inputId}>
          <Icon icon={Bell} size={16} />
          Email reminders
        </Text>
        <Copy id={hintId}>
          Unsigned signers get a reminder about once a day until they sign or the request expires.
        </Copy>
      </CopyCol>
    </Root>
  );
}
