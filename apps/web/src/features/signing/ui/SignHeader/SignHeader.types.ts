import type { MenuEntry } from '@/components/Menu';

export interface SignHeaderProps {
  /** Document title. Without it the header shows the logo only (status pages). */
  readonly title?: string | undefined;
  /** Sender's display name, shown as "from {name}". */
  readonly senderName?: string | null | undefined;
  /** Download the original PDF. Omit to hide the button. */
  readonly onDownload?: (() => void) | undefined;
  readonly downloadBusy?: boolean | undefined;
  /** Entries of the More menu. Omit or leave empty to hide it. */
  readonly menu?: ReadonlyArray<MenuEntry> | undefined;
}
