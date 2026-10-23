import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type BadgeTone = 'indigo' | 'amber' | 'emerald' | 'red' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone | undefined;
  /** Leading 6px dot in the tone colour. Ignored when `icon` is set. */
  readonly dot?: boolean | undefined;
  /** Leading 12px icon in the tone colour (canvas `.badge .ic`). */
  readonly icon?: LucideIcon | undefined;
  readonly children: ReactNode;
}
