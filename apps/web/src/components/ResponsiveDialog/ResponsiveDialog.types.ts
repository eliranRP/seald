import type { ReactNode } from 'react';

export interface ResponsiveDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Dialog heading; also the accessible name. */
  readonly title: string;
  /** Desktop card width in px (canvas modals: 420–560). Default 520. */
  readonly width?: number | undefined;
  /** Buttons on the right of the footer row. */
  readonly footer?: ReactNode;
  /** Content to the left of the footer buttons (a hint, a count). */
  readonly footerStart?: ReactNode;
  readonly children: ReactNode;
}
