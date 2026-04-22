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
  /**
   * Current zoom factor (1.0 = 100%). When provided together with any of the
   * zoom handlers, the toolbar renders a zoom-out / percentage / zoom-in
   * group to the right of the page controls. Omitted → no zoom UI (keeps
   * the default toolbar unchanged for existing consumers).
   */
  readonly zoom?: number | undefined;
  readonly onZoomOut?: (() => void) | undefined;
  readonly onZoomIn?: (() => void) | undefined;
  /** Reset to 100% when the user clicks the percentage label. */
  readonly onResetZoom?: (() => void) | undefined;
  /** Disabled thresholds — callers cap zoom themselves, toolbar only reflects the state. */
  readonly zoomOutDisabled?: boolean | undefined;
  readonly zoomInDisabled?: boolean | undefined;
}
