import type { HTMLAttributes } from 'react';

export interface ExitConfirmDialogProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
