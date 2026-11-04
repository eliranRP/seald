import { useState } from 'react';
import type { JSX } from 'react';
import { isEmailShape } from 'shared';
import { Button } from '@/components/Button';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { TextField } from '@/components/TextField';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';

export interface EditContactDialogProps {
  readonly open: boolean;
  /** The contact being edited. */
  readonly contact: AddSignerContact | null;
  /** Every saved contact: another one on the same email blocks the save. */
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly onClose: () => void;
  /** Reject with an axios-style 409 / `email_taken` to show the email error. */
  readonly onSave: (patch: { name: string; email: string }) => Promise<void>;
}

function isEmailTaken(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  return e.response?.status === 409 || e.response?.data?.error === 'email_taken';
}

/** Rename a contact or change its email; Cancel and Save in the footer. */
export function EditContactDialog(props: EditContactDialogProps): JSX.Element | null {
  const { open, contact, contacts, onClose, onSave } = props;
  if (!open || !contact) return null;
  // Keyed by id so reopening for another contact starts from its own values.
  return (
    <EditContactForm
      key={contact.id}
      contact={contact}
      contacts={contacts}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

interface FormProps {
  readonly contact: AddSignerContact;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly onClose: () => void;
  readonly onSave: EditContactDialogProps['onSave'];
}

function EditContactForm({ contact, contacts, onClose, onSave }: FormProps): JSX.Element {
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // Validate a field once the user leaves it (or tries to save), never mid-typing.
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const owner = contacts.find((c) => c.id !== contact.id && c.email.toLowerCase() === trimmedEmail);

  let emailError: string | undefined;
  if (owner) emailError = `${owner.name} already uses this email`;
  else if (serverError) emailError = serverError;
  else if ((tried || emailTouched) && !isEmailShape(trimmedEmail))
    emailError = 'Enter a valid email address, like name@company.com.';
  const nameError =
    (tried || nameTouched) && trimmedName.length === 0 ? 'Enter a name.' : undefined;

  const save = (): void => {
    if (busy) return;
    setTried(true);
    if (trimmedName.length === 0 || !isEmailShape(trimmedEmail) || owner) return;
    setBusy(true);
    setServerError(null);
    onSave({ name: trimmedName, email: trimmedEmail })
      .then(onClose)
      .catch((err: unknown) => {
        setServerError(
          isEmailTaken(err)
            ? 'That email is already in use by another contact.'
            : 'Could not save this contact. Try again.',
        );
      })
      .finally(() => setBusy(false));
  };

  const onEnter = (e: { key: string; preventDefault: () => void }): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title="Edit contact"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save contact
          </Button>
        </>
      }
    >
      <TextField
        label="Name"
        value={name}
        autoFocus
        onChange={setName}
        onBlur={() => setNameTouched(true)}
        onKeyDown={onEnter}
        error={nameError}
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(next) => {
          setEmail(next);
          setServerError(null);
        }}
        onBlur={() => setEmailTouched(true)}
        onKeyDown={onEnter}
        error={emailError}
      />
    </ResponsiveDialog>
  );
}
