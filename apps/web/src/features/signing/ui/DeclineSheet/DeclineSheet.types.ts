export type DeclineChip = 'wrong_person' | 'terms' | 'other';

export interface DeclineSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Sender's name, for the note placeholder. */
  readonly senderName: string | null | undefined;
  readonly busy?: boolean | undefined;
  readonly error?: string | null | undefined;
  /** Gets the composed reason (`"Terms: note"`), or undefined when the signer gave none. */
  readonly onConfirm: (reason: string | undefined) => void;
}
