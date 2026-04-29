import type { FormHTMLAttributes } from 'react';

/** Payload emitted when the user confirms the Save-as-template form. */
export interface SaveAsTemplatePayload {
  readonly title: string;
  readonly description: string;
}

export interface SaveAsTemplateDialogProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  readonly open: boolean;
  readonly defaultTitle?: string | undefined;
  readonly defaultDescription?: string | undefined;
  readonly onSave: (payload: SaveAsTemplatePayload) => void;
  readonly onCancel: () => void;
}
