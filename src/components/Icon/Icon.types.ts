import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Public props for the Icon wrapper. */
export interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  /** The Lucide icon component (pass the component, not a name). */
  readonly icon: LucideIcon;
  /** Box size in px. */
  readonly size?: 16 | 20 | 24 | 32 | undefined;
  /** When set, the icon becomes role="img" with this aria-label. Otherwise it's decorative. */
  readonly label?: string | undefined;
}
