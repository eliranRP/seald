import type { HTMLAttributes, ReactNode } from 'react';

export interface DocumentPageCanvasProps extends HTMLAttributes<HTMLDivElement> {
  readonly pageNum: number;
  readonly totalPages: number;
  readonly title?: string | undefined;
  /** Fixed render width in px. Defaults to 560. */
  readonly width?: number | undefined;
  /** Render children absolute-positioned inside the page area. */
  readonly children?: ReactNode | undefined;
  /**
   * Optional PDF source. When provided (and load succeeds), the canvas
   * renders the actual PDF page via `pdfjs-dist`. On any failure the
   * placeholder rules (lined bars) render instead and a small inline
   * "Preview unavailable" banner appears above the page — signing keeps
   * working because field coordinates are absolute and independent of
   * the rendered PDF.
   */
  readonly pdfSrc?: string | File | undefined;
}
