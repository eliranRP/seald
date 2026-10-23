import type { ReactNode } from 'react';

export interface ConfirmSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Destructive confirm (red). Default true. */
  readonly danger?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly error?: string | null | undefined;
  readonly onConfirm: () => void;
}
