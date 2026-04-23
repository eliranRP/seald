import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  readonly icon: LucideIcon;
  readonly size?: 16 | 20 | 24 | 32 | undefined;
  readonly label?: string | undefined;
}
