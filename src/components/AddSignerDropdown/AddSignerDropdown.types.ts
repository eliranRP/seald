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
  readonly onPick: (contact: AddSignerContact) => void;
  readonly onCreate: (name: string, email: string) => void;
  readonly onClose?: (() => void) | undefined;
  readonly placeholder?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly autoFocus?: boolean | undefined;
}
