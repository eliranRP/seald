import type { HTMLAttributes, ReactNode } from 'react';

export interface DocumentCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: string | undefined;
  readonly docId?: string | undefined;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly showSignatureLines?: boolean | undefined;
  readonly signatureLineLabels?: ReadonlyArray<string> | undefined;
  readonly contentRowCount?: number | undefined;
  readonly children?: ReactNode;
}
