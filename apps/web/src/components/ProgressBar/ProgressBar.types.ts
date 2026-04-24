import type { HTMLAttributes } from 'react';

export type ProgressBarTone = 'indigo' | 'success';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: number;
  readonly max: number;
  readonly label?: string | undefined;
  readonly tone?: ProgressBarTone | undefined;
}
