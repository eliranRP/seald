import type { HTMLAttributes } from 'react';

/**
 * Vertical, sticky page-thumbnail rail shown at the right edge of the
 * document canvas. Each thumb renders a mini skeleton of the page and, when
 * there are fields placed on it, an indigo count badge in the top-right
 * corner. The rail scrolls internally when the document has more pages than
 * fit in the reserved vertical space — so the control stays a fixed width
 * regardless of page count.
 */
export interface PageThumbRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  readonly totalPages: number;
  /** 1-indexed current page. */
  readonly currentPage: number;
  readonly onSelectPage: (page: number) => void;
  /**
   * Optional per-page field counts. A page with count > 0 shows the count as
   * an indigo badge on its thumb. Pages missing from the map are treated as
   * zero (no badge).
   */
  readonly fieldCountByPage?: Readonly<Record<number, number>> | undefined;
  /** aria-label for the wrapping <nav>. Defaults to "Page navigation". */
  readonly label?: string | undefined;
}
