import type { HTMLAttributes, ReactNode } from 'react';

/** ok = passed (emerald) · bad = failed (red) · off = not checked (grey). */
export type CheckChipState = 'ok' | 'bad' | 'off';

export interface CheckChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly state?: CheckChipState | undefined;
  /**
   * Position in its row (0-based) — staggers the rise-in animation.
   * Omit to animate without delay.
   */
  readonly index?: number | undefined;
  readonly children: ReactNode;
}
