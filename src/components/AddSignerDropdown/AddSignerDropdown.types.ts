import type { HTMLAttributes } from 'react';

export interface AddSignerContact {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface AddSignerDropdownProps extends HTMLAttributes<HTMLDivElement> {
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** Contact ids already added as signers — excluded from the list. */
  readonly existingContactIds?: ReadonlyArray<string> | undefined;
  /**
   * When provided, rows are rendered as multi-select checkboxes whose
   * `aria-checked` state reflects membership in this array; already-selected
   * contacts remain visible (not excluded) so the user can uncheck them.
   * Clicks fire `onPick(contact)` and the parent decides whether to add or
   * remove the contact.
   */
  readonly selectedIds?: ReadonlyArray<string> | undefined;
  readonly onPick: (contact: AddSignerContact) => void;
  readonly onCreate: (name: string, email: string) => void;
  readonly onClose?: (() => void) | undefined;
  readonly placeholder?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly autoFocus?: boolean | undefined;
}
