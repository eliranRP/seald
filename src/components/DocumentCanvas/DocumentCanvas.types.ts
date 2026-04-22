import type { HTMLAttributes, ReactNode } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdf';

export interface DocumentCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: string | undefined;
  readonly docId?: string | undefined;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly showSignatureLines?: boolean | undefined;
  readonly signatureLineLabels?: ReadonlyArray<string> | undefined;
  readonly contentRowCount?: number | undefined;
  /**
   * When provided, the canvas renders the real PDF page at the configured
   * width instead of the mock paper (title + grey rows + signature lines).
   * Field coordinates continue to live in the paper's CSS pixel space.
   */
  readonly pdfDoc?: PDFDocumentProxy | null | undefined;
  /**
   * CSS width used for the rendered PDF page. Defaults to the paper's built-in
   * width when a PDF is rendered.
   */
  readonly pdfPageWidth?: number | undefined;
  /**
   * True while a PDF is still being parsed (before `pdfDoc` arrives). When
   * set, the canvas renders a loading overlay instead of the mock paper so
   * users get feedback that a large upload is still processing.
   */
  readonly pdfLoading?: boolean | undefined;
  readonly children?: ReactNode;
}
