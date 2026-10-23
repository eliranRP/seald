import { forwardRef } from 'react';
import { ChevronDown, Send } from 'lucide-react';
import { Button } from '../Button';
import type { SplitButtonProps } from './SplitButton.types';
import { Group } from './SplitButton.styles';

/**
 * Primary action with an options chevron: the main half runs the action
 * with defaults, the chevron opens the options sheet first.
 */
export const SplitButton = forwardRef<HTMLDivElement, SplitButtonProps>((props, ref) => {
  const {
    label,
    icon = Send,
    onMain,
    onOptions,
    optionsLabel = 'Send options',
    disabled,
    fullWidth = false,
    ...rest
  } = props;
  return (
    <Group {...rest} ref={ref} role="group" aria-label={`${label} actions`} $full={fullWidth}>
      <Button variant="primary" iconLeft={icon} disabled={disabled} onClick={onMain}>
        {label}
      </Button>
      <Button
        variant="primary"
        iconOnly
        iconLeft={ChevronDown}
        aria-label={optionsLabel}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onOptions}
      />
    </Group>
  );
});

SplitButton.displayName = 'SplitButton';
