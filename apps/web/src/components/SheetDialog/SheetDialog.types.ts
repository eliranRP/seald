import type { ReactNode } from 'react';

export interface SheetDialogProps {
  readonly open: boolean;
  /** Called by the scrim, the close button and Escape. */
  readonly onClose: () => void;
  /** Accessible name of the dialog; also the heading when `showTitle` is set. */
  readonly title: string;
  /** Render `title` as the visible heading with a close button. Default true. */
  readonly showTitle?: boolean | undefined;
  /** Label of the close button. Default "Close". */
  readonly closeLabel?: string | undefined;
  /** Width of the modal on desktop, in px. Default 520. */
  readonly width?: number | undefined;
  readonly children: ReactNode;
  /** Action row; right-aligned on desktop, full width on a phone. */
  readonly footer?: ReactNode | undefined;
}
