import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** ok = passed (emerald) · bad = failed (red) · off = not checked (grey). */
export type CheckChipState = 'ok' | 'bad' | 'off';

export interface CheckChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly state?: CheckChipState | undefined;
  /**
   * Position in its row (0-based) — staggers the rise-in animation.
   * Omit to animate without delay.
   */
  readonly index?: number | undefined;
  /** Replaces the state glyph (check / x / minus). */
  readonly icon?: LucideIcon | undefined;
  /** `lg`: 36px tall with 15px text (40px on phones), for the verify verdict. */
  readonly size?: 'md' | 'lg' | undefined;
  readonly children: ReactNode;
}
