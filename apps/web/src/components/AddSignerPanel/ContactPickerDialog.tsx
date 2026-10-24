import { useId, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Search, X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { DialogBackdrop, DialogBody, DialogFoot, DialogHead } from '../DialogPrimitives';
import { MWBottomSheet } from '../MWBottomSheet';
import { TextField } from '../TextField';
import type { ContactPickerDialogProps } from './AddSignerPanel.types';
import {
  AddedTag,
  ContactEmail,
  ContactList,
  ContactName,
  ContactRow,
  ContactText,
  EmptyNote,
  PickerCard,
  PickerTitle,
  SearchWrap,
  SheetFoot,
} from './AddSignerPanel.styles';

/**
 * Multi-select list of the sender's contacts. People already on the signer
 * list show checked, disabled and tagged "Added". Dialog on desktop, bottom
 * sheet on phones.
 */
export function ContactPickerDialog(props: ContactPickerDialogProps): JSX.Element | null {
  const { open, contacts, existingIds, onClose, onAdd } = props;
  const titleId = useId();
  const isMobile = useIsMobileViewport();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlyArray<string>>([]);

  useEscapeKey(onClose, open && !isMobile);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  if (!open) return null;

  const toggle = (id: string): void => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = (): void => {
    const chosen = contacts.filter((c) => picked.includes(c.id));
    if (chosen.length === 0) return;
    onAdd(chosen);
  };

  const label = `Add ${String(picked.length)} ${picked.length === 1 ? 'signer' : 'signers'}`;

  const body = (
    <>
      <SearchWrap>
        <TextField
          type="search"
          iconLeft={Search}
          placeholder="Search contacts"
          aria-label="Search contacts"
          value={query}
          onChange={setQuery}
        />
      </SearchWrap>
      {visible.length === 0 ? (
        <EmptyNote>{contacts.length === 0 ? 'No contacts yet' : 'No matches'}</EmptyNote>
      ) : (
        <ContactList>
          {visible.map((c) => {
            const added = existingIds.includes(c.id);
            return (
              <li key={c.id}>
                <ContactRow $disabled={added}>
                  <input
                    type="checkbox"
                    aria-label={c.name}
                    checked={added || picked.includes(c.id)}
                    disabled={added}
                    onChange={() => toggle(c.id)}
                  />
                  <Avatar name={c.name} size={32} />
                  <ContactText>
                    <ContactName>{c.name}</ContactName>
                    <ContactEmail>{c.email}</ContactEmail>
                  </ContactText>
                  {added ? <AddedTag>Added</AddedTag> : null}
                </ContactRow>
              </li>
            );
          })}
        </ContactList>
      )}
    </>
  );

  if (isMobile) {
    return (
      <MWBottomSheet open onClose={onClose} title="Contacts">
        {body}
        <SheetFoot>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={picked.length === 0} onClick={submit}>
            {label}
          </Button>
        </SheetFoot>
      </MWBottomSheet>
    );
  }

  return (
    <DialogBackdrop role="presentation" onClick={onClose}>
      <PickerCard
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHead>
          <PickerTitle id={titleId}>Contacts</PickerTitle>
          <Button variant="ghost" iconOnly iconLeft={X} aria-label="Close" onClick={onClose} />
        </DialogHead>
        <DialogBody>{body}</DialogBody>
        <DialogFoot>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={picked.length === 0} onClick={submit}>
            {label}
          </Button>
        </DialogFoot>
      </PickerCard>
    </DialogBackdrop>
  );
}
