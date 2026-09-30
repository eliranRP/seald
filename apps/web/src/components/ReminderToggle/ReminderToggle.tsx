import { useId, useRef } from 'react';
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
  const titleId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = disabled || pending;
  const keepChecked = (): void => {
    const input = inputRef.current;
    if (!input) return;
    input.checked = enabled;
  };
  return (
    <Root
      htmlFor={inputId}
      onClick={(event) => {
        if (!locked) return;
        event.preventDefault();
        // user-event replaces preventDefault on label clicks, so the
        // browser can still toggle the control. Put the checked state
        // back after that default action.
        queueMicrotask(keepChecked);
      }}
    >
      <Input
        ref={inputRef}
        id={inputId}
        type="checkbox"
        role="switch"
        checked={enabled}
        disabled={disabled}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onClick={(event) => {
          if (!locked) return;
          event.preventDefault();
          queueMicrotask(keepChecked);
        }}
        onChange={(event) => {
          if (locked) {
            event.currentTarget.checked = enabled;
            return;
          }
          onChange(event.currentTarget.checked);
        }}
      />
      <CopyCol>
        <Text id={titleId}>
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
