import type { HTMLAttributes } from 'react';

/** Compact pill-shaped toolbar that sits above the document canvas. */
export interface PageToolbarProps extends HTMLAttributes<HTMLDivElement> {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly onPrevPage: () => void;
  readonly onNextPage: () => void;
  /** Optional jump-to-next-zone action. When undefined, hides the target button + divider. */
  readonly onJumpToNextZone?: (() => void) | undefined;
  /** Overrides the jump-button aria-label. */
  readonly jumpLabel?: string | undefined;
}
