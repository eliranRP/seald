import type { HTMLAttributes } from 'react';
import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';

export interface AddSignerPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The sender's address book, most recent first. */
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** Ids of people already on the signer list. */
  readonly existingIds: ReadonlyArray<string>;
  /** Emails already on the list (a new email may match an existing signer). */
  readonly existingEmails?: ReadonlyArray<string> | undefined;
  /** One or more contacts picked (one tap on an avatar, or the picker's Add). */
  readonly onAddContacts: (contacts: ReadonlyArray<AddSignerContact>) => void;
  /** A name and email typed in the inline form; the host saves it to Contacts. */
  readonly onCreate: (name: string, email: string) => void;
  /** How many recent contacts to offer as one-tap avatars. Default 5. */
  readonly maxRecent?: number | undefined;
}

export interface ContactPickerDialogProps {
  readonly open: boolean;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly existingIds: ReadonlyArray<string>;
  readonly onClose: () => void;
  readonly onAdd: (contacts: ReadonlyArray<AddSignerContact>) => void;
}
