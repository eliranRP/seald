import type { HTMLAttributes } from 'react';

export interface GuestBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly label?: string | undefined;
}
