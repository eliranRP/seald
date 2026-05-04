import type { HTMLAttributes, ReactNode } from 'react';

export interface RecipientHeaderProps extends HTMLAttributes<HTMLElement> {
  readonly docTitle: string;
  readonly docId: string;
  readonly senderName?: string | undefined;
  readonly stepLabel?: string | undefined;
  readonly onExit?: (() => void) | undefined;
  readonly logo?: ReactNode | undefined;
  /**
   * When provided, renders a small icon button before the optional Exit
   * button that lets the recipient download the original (unsigned) PDF
   * they're currently viewing. Wired by the signing flow.
   */
  readonly onDownloadPdf?: (() => void) | undefined;
  /**
   * Disables the download button while a fetch is in-flight (the hook
   * tracks its own busy state and forwards it here so the chrome can
   * reflect the pending state without owning it).
   */
  readonly downloadPdfBusy?: boolean | undefined;
}
