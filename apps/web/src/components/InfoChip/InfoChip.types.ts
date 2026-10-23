import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface InfoChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Optional leading icon (16px, inherits the chip colour). */
  readonly icon?: LucideIcon | undefined;
  readonly children: ReactNode;
}
