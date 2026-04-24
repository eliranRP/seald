import { forwardRef } from 'react';
import type { ProgressBarProps } from './ProgressBar.types';
import { Filled, Track } from './ProgressBar.styles';

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>((props, ref) => {
  const { value, max, label, tone = 'indigo', ...rest } = props;

  const clampedValue = Math.min(max, Math.max(0, value));
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const ariaLabel = label ?? `${value} of ${max}`;

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clampedValue}
      aria-label={ariaLabel}
      {...rest}
    >
      <Track>
        <Filled $pct={pct} $tone={tone} data-tone={tone} style={{ width: `${pct}%` }} />
      </Track>
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';
