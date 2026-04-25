import { useMemo, useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { useAppState } from '@/providers/AppStateProvider';
import { ExitConfirmDialog } from '@/components/ExitConfirmDialog';
import {
  ActionsCell,
  DialogBackdrop,
  DialogCard,
  DialogFooter,
  DialogTitle,
  DocsCell,
  EmailCell,
  FieldStack,
  Inner,
  Main,
  NameCell,
  TableHead,
  TableRow,
  TableShell,
} from './ContactsPage.styles';

type DialogState =
  | { readonly mode: 'closed' }
  | { readonly mode: 'add' }
  | { readonly mode: 'edit'; readonly contact: AddSignerContact };

function isValidEmail(value: string): boolean {
  // Minimal shape check — enough to catch obvious typos in the demo app.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface RenderContactsBodyArgs {
  readonly loading: boolean;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly docCountBySigner: ReadonlyMap<string, number>;
  readonly onEdit: (contact: AddSignerContact) => void;
  readonly onDelete: (id: string) => void;
}

function renderContactsBody(args: RenderContactsBodyArgs): JSX.Element | JSX.Element[] {
  const { loading, contacts, docCountBySigner, onEdit, onDelete } = args;
  // While the initial fetch is in flight and we have nothing cached, render
  // skeleton rows sized to the real table so the layout doesn't shift when
  // data lands.
  if (loading && contacts.length === 0) {
    return Array.from({ length: 5 }, (_, i) => (
      <TableRow key={`sk-${i}`} aria-hidden>
        <NameCell>
          <Skeleton variant="circle" width={32} height={32} />
          <Skeleton width={140} />
        </NameCell>
        <EmailCell>
          <Skeleton width={180} />
        </EmailCell>
        <DocsCell>
          <Skeleton width={90} />
        </DocsCell>
        <ActionsCell>
          <Skeleton variant="rect" width={56} height={28} />
          <Skeleton variant="rect" width={72} height={28} />
        </ActionsCell>
      </TableRow>
    ));
  }
  if (contacts.length === 0) {
    return <EmptyState>No signers yet. Add one to get started.</EmptyState>;
  }
  return contacts.map((c) => (
    <TableRow key={c.id}>
      <NameCell>
        <Avatar name={c.name} size={32} />
        <span>{c.name}</span>
      </NameCell>
      <EmailCell>{c.email}</EmailCell>
      <DocsCell>
        {docCountBySigner.get(c.id) ?? 0} document
        {(docCountBySigner.get(c.id) ?? 0) === 1 ? '' : 's'}
      </DocsCell>
      <ActionsCell>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={Pencil}
          aria-label={`Edit ${c.name}`}
          onClick={() => onEdit(c)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={Trash2}
          aria-label={`Delete ${c.name}`}
          onClick={() => onDelete(c.id)}
        >
          Delete
        </Button>
      </ActionsCell>
    </TableRow>
  ));
}

/**
 * L4 page — Contacts / Signers CRUD. Lists every contact from `useAppState`
 * and exposes add / edit / delete through a small dialog. Used as the target
 * of the `Signers` top-level nav item and as a deeper management surface for
 * the (smaller) add-signer popovers inside the document editor.
 */
export function ContactsPage() {
  const { contacts, contactsLoading, documents, addContact, updateContact, removeContact } =
    useAppState();
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openAdd = (): void => {
    setName('');
    setEmail('');
    setError(null);
    setDialog({ mode: 'add' });
  };

  const openEdit = (contact: AddSignerContact): void => {
    setName(contact.name);
    setEmail(contact.email);
    setError(null);
    setDialog({ mode: 'edit', contact });
  };

  const closeDialog = (): void => {
    setDialog({ mode: 'closed' });
  };

  const handleSubmit = (): void => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Please enter a name.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (dialog.mode === 'add') {
      addContact(trimmedName, trimmedEmail);
    } else if (dialog.mode === 'edit') {
      updateContact(dialog.contact.id, { name: trimmedName, email: trimmedEmail });
    }
    closeDialog();
  };

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string): void => {
    setPendingDeleteId(id);
  };

  const confirmDelete = (): void => {
    if (pendingDeleteId) {
      removeContact(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  const docCountBySigner = useMemo(() => {
    const map = new Map<string, number>();
    documents.forEach((doc) => {
      doc.signers.forEach((s) => {
        map.set(s.id, (map.get(s.id) ?? 0) + 1);
      });
    });
    return map;
  }, [documents]);

  return (
    <Main>
      <Inner>
        <PageHeader
          eyebrow="Signers"
          title="People you send documents to"
          actions={
            <Button variant="primary" iconLeft={UserPlus} onClick={openAdd}>
              Add signer
            </Button>
          }
        />

        <TableShell>
          <TableHead>
            <div>Name</div>
            <div>Email</div>
            <div>Documents</div>
            <div aria-hidden />
          </TableHead>
          {renderContactsBody({
            loading: contactsLoading,
            contacts,
            docCountBySigner,
            onEdit: openEdit,
            onDelete: handleDelete,
          })}
        </TableShell>
      </Inner>

      <ExitConfirmDialog
        open={pendingDeleteId !== null}
        title="Remove this signer?"
        description="They will still appear on any documents where they were already placed, but you won't see them in this list anymore."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      {dialog.mode !== 'closed' ? (
        <DialogBackdrop role="presentation" onClick={closeDialog}>
          <DialogCard
            role="dialog"
            aria-modal="true"
            aria-label={dialog.mode === 'add' ? 'Add signer' : 'Edit signer'}
            onClick={(e) => e.stopPropagation()}
          >
            <DialogTitle>{dialog.mode === 'add' ? 'Add signer' : 'Edit signer'}</DialogTitle>
            <FieldStack>
              <TextField label="Name" value={name} onChange={(next) => setName(next)} autoFocus />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(next) => setEmail(next)}
                {...(error ? { error } : {})}
              />
            </FieldStack>
            <DialogFooter>
              <Button variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit}>
                {dialog.mode === 'add' ? 'Add signer' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogCard>
        </DialogBackdrop>
      ) : null}
    </Main>
  );
}
