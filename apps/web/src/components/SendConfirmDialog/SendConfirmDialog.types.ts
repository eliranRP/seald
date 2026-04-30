import type { HTMLAttributes } from 'react';

export interface SendConfirmDialogProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  /** Send the envelope without persisting field changes back to the template. */
  readonly onJustSend: () => void;
  /** Send AND patch the saved template with the current field layout. */
  readonly onSendAndUpdate: () => void;
  readonly onCancel: () => void;
}
