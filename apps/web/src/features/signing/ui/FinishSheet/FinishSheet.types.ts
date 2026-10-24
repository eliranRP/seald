import type { ReactNode } from 'react';

export interface FinishSheetProps {
  readonly open: boolean;
  /** "Back": closes the sheet, leaving the document as it is. */
  readonly onClose: () => void;
  readonly docTitle: string;
  readonly signerName: string;
  readonly signerEmail: string;
  /** The signature as it will be placed (image or script text). */
  readonly preview: ReactNode;
  readonly busy?: boolean | undefined;
  readonly error?: string | null | undefined;
  /** Records intent-to-sign, then submits. */
  readonly onSign: () => void;
  /**
   * When the sender asked for a fresh emailed code, the code form replaces
   * the Sign button (the intent event is already on record by then).
   */
  readonly codeForm?: ReactNode | undefined;
}
