import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'indigo' | 'amber' | 'emerald' | 'red' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone | undefined;
  readonly dot?: boolean | undefined;
  readonly children: ReactNode;
}
