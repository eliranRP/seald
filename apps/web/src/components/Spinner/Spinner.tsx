import { forwardRef } from 'react';
import type { SpinnerProps } from './Spinner.types';
import { SpinnerRoot } from './Spinner.styles';

/**
 * L1 primitive — in-flight indicator (sealing, resend, saving). Inherits
 * `currentColor`, so it reads correctly inside any button or chip.
 */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>((props, ref) => {
  const { size = 'md', label, ...rest } = props;
  const a11y = label
    ? ({ role: 'status', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return <SpinnerRoot ref={ref} $size={size} {...a11y} {...rest} />;
});
Spinner.displayName = 'Spinner';
