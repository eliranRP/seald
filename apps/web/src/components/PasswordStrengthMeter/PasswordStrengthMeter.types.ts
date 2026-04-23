import type { HTMLAttributes } from 'react';

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrengthMeterProps extends HTMLAttributes<HTMLDivElement> {
  readonly level: PasswordStrength;
}
