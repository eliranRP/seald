import type { HTMLAttributes } from 'react';

export interface GuestSenderEmailDialogProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  /**
   * Fires when the user submits a valid email. The parent passes the
   * captured `(email, name?)` pair into the API send request as the
   * sender identity for guest mode.
   */
  readonly onConfirm: (email: string, name?: string) => void;
  readonly onCancel: () => void;
}
