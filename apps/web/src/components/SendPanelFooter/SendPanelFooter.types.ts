import type { HTMLAttributes } from 'react';

export interface SendPanelFooterProps extends HTMLAttributes<HTMLDivElement> {
  readonly fieldCount: number;
  readonly signerCount: number;
  readonly onSend: () => void;
  readonly onSaveDraft?: (() => void) | undefined;
  readonly primaryLabel?: string | undefined;
  readonly disabledHint?: string | undefined;
  readonly saveDraftLabel?: string | undefined;
}
