import type { HTMLAttributes, ReactNode } from 'react';

export type ReviewFieldKind =
  | 'signature'
  | 'initials'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'email'
  | 'name';

export interface ReviewItem {
  readonly id: string;
  readonly kind: ReviewFieldKind;
  readonly label: string;
  readonly page: number;
  /**
   * The preview rendered on the right side of the row. For signatures the
   * caller passes a <SignatureMark/>; for checkboxes a string like "Checked";
   * for text/date/name/email the raw string.
   */
  readonly valuePreview: ReactNode;
  /**
   * Optional inline-edit callback. When supplied the row renders an
   * accessible "Edit" button at the far right that invokes this callback.
   * Used by the signer-flow review page (item 11) to pop FieldInputDrawer
   * or SignatureCapture without leaving the page.
   */
  readonly onEdit?: () => void;
}

export interface ReviewListProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: ReadonlyArray<ReviewItem>;
}
