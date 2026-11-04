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
import { EMAIL_HINT, emailOk } from './envelopeView';
import {
  FieldBox,
  FieldHint,
  MetaLine,
  Muted,
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

function ReplaceForm(props: ReplaceSignerDialogProps & { readonly signer: EnvelopeSigner }) {
  const { signer, takenEmails, busy, onCancel, onReplace } = props;
  const contactsQuery = useContactsQuery(true);
  const [tab, setTab] = useState<Tab>('contacts');
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  // Errors show once the field is left or Replace is pressed, then update live.
  const [touched, setTouched] = useState(false);
  const groupName = useId();
  const hintId = useId();
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
  let emailError: string | null = null;
  if (typedTaken) emailError = 'Already on this envelope. Enter a different email.';
  else if (touched && !emailOk(email)) emailError = EMAIL_HINT;
  const pickError = touched && tab === 'contacts' && picked === null;

  const submit = (): void => {
    setTouched(true);
    if (busy || typedTaken) return;
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
            onChange={(next) => {
              setTab(next);
              setTouched(false);
            }}
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
                      <SignerName dir="auto" title={c.name}>
                        {c.name}
                      </SignerName>
                      <SignerEmail title={c.email}>{c.email}</SignerEmail>
                    </PickWho>
                  </PickRow>
                ))}
                {contacts.length === 0 ? (
                  <Muted>
                    {contactsQuery.isPending
                      ? 'Loading contacts…'
                      : 'No contacts found. Try another search, or use New email.'}
                  </Muted>
                ) : null}
              </PickList>
              {pickError ? <FieldHint role="alert">Pick a contact to send to.</FieldHint> : null}
            </Stack>
          ) : (
            <Stack>
              <FieldBox>
                <Mail size={16} aria-hidden />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  aria-label="New signer email"
                  aria-invalid={emailError !== null || undefined}
                  aria-describedby={emailError !== null ? hintId : undefined}
                  value={email}
                  onBlur={() => setTouched(email.trim() !== '' || touched)}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FieldBox>
              {emailError !== null ? (
                <FieldHint id={hintId} role="alert">
                  {emailError}
                </FieldHint>
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
        {/* Stays pressable: a press with something missing says what to fix. */}
        <Button iconLeft={Send} loading={busy} onClick={submit}>
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
