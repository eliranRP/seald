import type { HTMLAttributes } from 'react';
import type { BadgeTone } from '../Badge/Badge.types';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: string;
  readonly value: string;
  readonly tone: BadgeTone;
  /**
   * When provided, the card renders as a `<button>` and calls this on
   * click / Enter / Space. Use it to wire a stat tile to a filter.
   */
  readonly onActivate?: () => void;
  /**
   * Pressed state for an interactive card — set when the filter this
   * tile maps to is currently active. Ignored unless `onActivate` is set.
   */
  readonly active?: boolean;
}
