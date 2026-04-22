import type { HTMLAttributes } from 'react';
import type { AddSignerContact } from '../AddSignerDropdown';

export interface CreateSignatureRequestDialogSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface CreateSignatureRequestDialogProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly open: boolean;
  /** Signers already added to this document. Rendered as rows the user can remove. */
  readonly signers: ReadonlyArray<CreateSignatureRequestDialogSigner>;
  /** Address book contacts shown when the user opens the inline receiver picker. */
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly onAddFromContact: (contact: AddSignerContact) => void;
  readonly onCreateContact: (name: string, email: string) => void;
  readonly onRemoveSigner: (id: string) => void;
  /** Called when the user confirms. The parent is responsible for advancing views. */
  readonly onApply: () => void;
  /** Called when the user dismisses via Cancel, backdrop click, or Escape. */
  readonly onCancel: () => void;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly applyLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly addReceiverLabel?: string | undefined;
  readonly emptyHint?: string | undefined;
}
