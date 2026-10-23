import { useId, useMemo, useState } from 'react';
import { Link2, Mail, Search, Send, UserPlus, Users, X } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import {
  DialogBackdrop,
  DialogBody,
  DialogFoot,
  DialogHead,
  DialogSectionedCard,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useContactsQuery } from '@/features/contacts/useContacts';
import type { EnvelopeSigner } from '@/features/envelopes';
import {
  FieldBox,
  MetaLine,
  PickList,
  PickRow,
  PickWho,
  SignerEmail,
  SignerName,
  Spacer,
  Stack,
} from './EnvelopeDetailPage.styles';

export interface ReplaceSignerDialogProps {
  /** The signer being replaced; the dialog is closed when null. */
  readonly signer: EnvelopeSigner | null;
  /** Emails already on the envelope. They cannot be picked again. */
  readonly takenEmails: ReadonlyArray<string>;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onReplace: (next: { readonly name: string; readonly email: string }) => void;
}

type Tab = 'contacts' | 'email';

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ReplaceForm(props: ReplaceSignerDialogProps & { readonly signer: EnvelopeSigner }) {
  const { signer, takenEmails, busy, onCancel, onReplace } = props;
  const contactsQuery = useContactsQuery(true);
  const [tab, setTab] = useState<Tab>('contacts');
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const groupName = useId();
  const first = signer.name.split(/\s+/)[0] ?? signer.name;
  const taken = useMemo(() => new Set(takenEmails.map((e) => e.toLowerCase())), [takenEmails]);
  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contactsQuery.data ?? [])
      .filter((c) => !taken.has(c.email.toLowerCase()))
      .filter((c) => q === '' || `${c.name} ${c.email}`.toLowerCase().includes(q));
  }, [contactsQuery.data, query, taken]);
  const picked = contacts.find((c) => c.id === pickedId) ?? null;
  const typedTaken = taken.has(email.trim().toLowerCase());
  const canSubmit = !busy && (tab === 'contacts' ? picked !== null : emailOk(email) && !typedTaken);

  const submit = (): void => {
    if (tab === 'contacts' && picked) {
      onReplace({ name: picked.name, email: picked.email });
    } else if (tab === 'email' && emailOk(email)) {
      const address = email.trim();
      onReplace({ name: address.split('@')[0] ?? address, email: address });
    }
  };

  return (
    <>
      <DialogHead>
        <DialogTitle as="h2">{`Replace ${signer.name}`}</DialogTitle>
        <Spacer />
        <Button variant="ghost" iconOnly iconLeft={X} aria-label="Close" onClick={onCancel} />
      </DialogHead>
      <DialogBody>
        <Stack>
          <SegmentedControl<Tab>
            aria-label="Signer source"
            block
            value={tab}
            onChange={setTab}
            options={[
              { value: 'contacts', label: 'From contacts', icon: Users },
              { value: 'email', label: 'New email', icon: UserPlus },
            ]}
          />
          {tab === 'contacts' ? (
            <Stack>
              <FieldBox>
                <Search size={16} aria-hidden />
                <input
                  type="text"
                  placeholder="Search contacts"
                  aria-label="Search contacts"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </FieldBox>
              <PickList>
                {contacts.map((c) => (
                  <PickRow key={c.id}>
                    <input
                      type="radio"
                      name={groupName}
                      checked={pickedId === c.id}
                      onChange={() => setPickedId(c.id)}
                      aria-label={`${c.name}, ${c.email}`}
                    />
                    <Avatar name={c.name} size={32} />
                    <PickWho>
                      <SignerName>{c.name}</SignerName>
                      <SignerEmail>{c.email}</SignerEmail>
                    </PickWho>
                  </PickRow>
                ))}
                {contacts.length === 0 ? (
                  <SignerEmail>
                    {contactsQuery.isPending ? 'Loading contacts' : 'No contacts found'}
                  </SignerEmail>
                ) : null}
              </PickList>
            </Stack>
          ) : (
            <Stack>
              <FieldBox>
                <Mail size={16} aria-hidden />
                <input
                  type="email"
                  placeholder="name@company.com"
                  aria-label="New signer email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FieldBox>
              {typedTaken ? (
                <SignerEmail role="alert">Already on this envelope.</SignerEmail>
              ) : null}
            </Stack>
          )}
          <MetaLine>
            <Link2 size={14} aria-hidden />
            {`${first}'s link stops working.`}
          </MetaLine>
        </Stack>
      </DialogBody>
      <DialogFoot>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button iconLeft={Send} disabled={!canSubmit} loading={busy} onClick={submit}>
          Replace &amp; send
        </Button>
      </DialogFoot>
    </>
  );
}

/** "Replace Alex": pick a contact or type an email; the old link stops working. */
export function ReplaceSignerDialog(props: ReplaceSignerDialogProps) {
  const { signer, onCancel } = props;
  useEscapeKey(onCancel, signer !== null);
  if (signer === null) return null;
  return (
    <DialogBackdrop role="presentation" onClick={onCancel}>
      <DialogSectionedCard
        role="dialog"
        aria-modal="true"
        aria-label="Replace signer"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <ReplaceForm key={signer.id} {...props} signer={signer} />
      </DialogSectionedCard>
    </DialogBackdrop>
  );
}
