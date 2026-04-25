import type { HTMLAttributes } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf';

export interface PdfPageViewProps extends HTMLAttributes<HTMLDivElement> {
  /** Parsed PDF document — obtain from `usePdfDocument(source)`. */
  readonly doc: PDFDocumentProxy;
  /** 1-indexed page number to render. */
  readonly pageNumber: number;
  /** CSS width in pixels. Height is derived from the page's aspect ratio. */
  readonly width: number;
  /**
   * Called after the page finishes rendering with the computed CSS width/height.
   * Useful for parents that need to size overlays (e.g. a field canvas) to
   * match the rendered page.
   */
  readonly onRendered?:
    | ((size: { readonly width: number; readonly height: number }) => void)
    | undefined;
}
