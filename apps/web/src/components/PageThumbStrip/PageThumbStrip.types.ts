import type { HTMLAttributes } from 'react';

/**
 * Horizontal page-thumbnail selector shown below a document canvas.
 * Each thumb represents a 1-indexed page; clicking or activating one
 * calls `onSelectPage`. Pages listed in `pagesWithFields` render a tiny
 * indigo dot in the top-right of the thumb.
 */
export interface PageThumbStripProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  readonly totalPages: number;
  /** 1-indexed current page. */
  readonly currentPage: number;
  readonly onSelectPage: (page: number) => void;
  readonly pagesWithFields?: ReadonlyArray<number> | undefined;
  /** aria-label for the wrapping <nav>. Defaults to "Page navigation". */
  readonly label?: string | undefined;
}
