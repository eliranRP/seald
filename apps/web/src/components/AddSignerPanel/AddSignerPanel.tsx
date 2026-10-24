import { forwardRef, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, UserPlus, Users } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { TextField } from '../TextField';
import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';
import type { AddSignerPanelProps } from './AddSignerPanel.types';
import { ContactPickerDialog } from './ContactPickerDialog';
import {
  ButtonRow,
  Eyebrow,
  FormActions,
  FormCard,
  FormError,
  RecentButton,
  RecentRow,
  Root,
  SavedNote,
} from './AddSignerPanel.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_MAX_RECENT = 5;

function nameFromEmail(email: string): string {
  return email.split('@')[0] ?? email;
}

/**
 * How a signer is added on the Prepare screen: one-tap recent contacts, a
 * "From contacts" multi-select, and a "New email" inline form that saves
 * the person to Contacts.
 */
export const AddSignerPanel = forwardRef<HTMLDivElement, AddSignerPanelProps>((props, ref) => {
  const {
    contacts,
    existingIds,
    existingEmails = [],
    onAddContacts,
    onCreate,
    maxRecent = DEFAULT_MAX_RECENT,
    ...rest
  } = props;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recent = useMemo(
    () => contacts.filter((c) => !existingIds.includes(c.id)).slice(0, maxRecent),
    [contacts, existingIds, maxRecent],
  );

  const closeForm = (): void => {
    setFormOpen(false);
    setName('');
    setEmail('');
    setError(null);
  };

  const submitForm = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email');
      return;
    }
    if (existingEmails.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      setError('Already on the list');
      return;
    }
    onCreate(name.trim() || nameFromEmail(trimmed), trimmed);
    closeForm();
  };

  const handlePicked = (picked: ReadonlyArray<AddSignerContact>): void => {
    setPickerOpen(false);
    onAddContacts(picked);
  };

  return (
    <Root {...rest} ref={ref}>
      {recent.length > 0 ? (
        <>
          <Eyebrow>Recent</Eyebrow>
          <RecentRow>
            {recent.map((c) => (
              <RecentButton
                key={c.id}
                type="button"
                title={`${c.name} · ${c.email}`}
                aria-label={`Add ${c.name}`}
                onClick={() => onAddContacts([c])}
              >
                <Avatar name={c.name} size={40} />
              </RecentButton>
            ))}
          </RecentRow>
        </>
      ) : null}
      <ButtonRow>
        <Button variant="secondary" iconLeft={Users} onClick={() => setPickerOpen(true)}>
          From contacts
        </Button>
        <Button
          variant="secondary"
          iconLeft={UserPlus}
          aria-expanded={formOpen}
          onClick={() => setFormOpen(true)}
        >
          New email
        </Button>
      </ButtonRow>
      {formOpen ? (
        <FormCard noValidate onSubmit={submitForm} aria-label="New signer">
          <TextField label="Name" value={name} onChange={setName} autoComplete="off" />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError(null);
            }}
            autoComplete="off"
            autoFocus
          />
          {error ? <FormError role="alert">{error}</FormError> : null}
          <SavedNote>
            <Check size={14} aria-hidden />
            Saved to Contacts
          </SavedNote>
          <FormActions>
            <Button variant="ghost" size="sm" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Add
            </Button>
          </FormActions>
        </FormCard>
      ) : null}
      <ContactPickerDialog
        open={pickerOpen}
        contacts={contacts}
        existingIds={existingIds}
        onClose={() => setPickerOpen(false)}
        onAdd={handlePicked}
      />
    </Root>
  );
});

AddSignerPanel.displayName = 'AddSignerPanel';
