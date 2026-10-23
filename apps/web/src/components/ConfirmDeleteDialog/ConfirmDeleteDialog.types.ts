import type { HTMLAttributes, ReactNode } from 'react';

export interface ConfirmDeleteDialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly open: boolean;
  /** "Delete NDA — standard?" */
  readonly title: string;
  /** One quiet line under the title ("Sent documents stay."). */
  readonly note?: string | undefined;
  /** Optional row between the title and the note (e.g. avatars). */
  readonly children?: ReactNode;
  readonly keepLabel?: string | undefined;
  readonly deleteLabel?: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
