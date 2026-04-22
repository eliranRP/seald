import type { HTMLAttributes } from 'react';

/**
 * Scope the user picks when removing a field that has linked copies on other
 * pages. `only-this` removes just the field that was clicked; `all-pages`
 * removes every field sharing the same linkId.
 */
export type RemoveLinkedScope = 'only-this' | 'all-pages';

export interface RemoveLinkedCopiesDialogProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  /** Number of linked copies across all pages (including the one clicked). */
  readonly linkedCount: number;
  readonly onConfirm: (scope: RemoveLinkedScope) => void;
  readonly onCancel: () => void;
  readonly title?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
}
