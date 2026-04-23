import { forwardRef } from 'react';
import type { PasswordStrength, PasswordStrengthMeterProps } from './PasswordStrengthMeter.types';
import { Bar, BarRow, Label, Root } from './PasswordStrengthMeter.styles';

const LABELS: Record<PasswordStrength, string> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Okay',
  3: 'Strong',
  4: 'Excellent',
};

const BAR_COUNT = 4;

export const PasswordStrengthMeter = forwardRef<HTMLDivElement, PasswordStrengthMeterProps>(
  (props, ref) => {
    const { level, ...rest } = props;
    const label = LABELS[level];

    return (
      <Root
        ref={ref}
        role="progressbar"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={level}
        aria-valuetext={label}
        {...rest}
      >
        <BarRow>
          {Array.from({ length: BAR_COUNT }, (_, i) => {
            const filled = i < level;
            return (
              <Bar
                key={i}
                $filled={filled}
                $level={level}
                data-testid="password-strength-bar"
                data-filled={filled ? 'true' : 'false'}
              />
            );
          })}
        </BarRow>
        <Label data-testid="password-strength-label">{label}</Label>
      </Root>
    );
  },
);

PasswordStrengthMeter.displayName = 'PasswordStrengthMeter';
