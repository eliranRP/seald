import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Sparkles } from 'lucide-react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { EmailChipsInput } from '@/components/EmailChipsInput';
import type { EmailChipsValue } from '@/components/EmailChipsInput';
import { Icon } from '@/components/Icon';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import styled from 'styled-components';
import {
  classifyEmails,
  countEmailChips,
  summarizeEmailChips,
  tokensFromText,
} from './classifyEmails';

const Hint = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export interface AddContactsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Lower-cased emails of the saved contacts (they show as duplicates). */
  readonly existingEmails: ReadonlySet<string>;
  /** Adds the new addresses; reject to keep the dialog open with an error. */
  readonly onAdd: (emails: ReadonlyArray<string>) => Promise<void>;
}

const EMPTY: EmailChipsValue = { tokens: [], draft: '' };

/**
 * Add contacts from a pasted or typed list. Every address becomes a chip
 * (new, already saved, invalid); the primary button adds only the new ones
 * and says how many ("Add 3"). The server guesses each name from the email.
 */
export function AddContactsDialog(props: AddContactsDialogProps): JSX.Element | null {
  const { open, onClose, existingEmails, onAdd } = props;
  const [value, setValue] = useState<EmailChipsValue>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Text still in the field counts too, so a single typed address can be added
  // without pressing Enter first.
  const effectiveTokens = useMemo(() => [...value.tokens, ...tokensFromText(value.draft)], [value]);
  const chips = useMemo(
    () => classifyEmails(effectiveTokens, existingEmails),
    [effectiveTokens, existingEmails],
  );
  const counts = countEmailChips(chips);
  const summary = summarizeEmailChips(counts);

  const close = (): void => {
    setValue(EMPTY);
    setFailed(false);
    onClose();
  };

  const submit = (): void => {
    if (busy || counts.added === 0) return;
    const emails = chips.filter((c) => c.kind === 'new').map((c) => c.email);
    setBusy(true);
    setFailed(false);
    onAdd(emails)
      .then(() => {
        setValue(EMPTY);
        onClose();
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      title="Add contacts"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={counts.added === 0} loading={busy} onClick={submit}>
            {counts.added > 0 ? `Add ${String(counts.added)}` : 'Add'}
          </Button>
        </>
      }
    >
      <EmailChipsInput
        value={value}
        onChange={setValue}
        existingEmails={existingEmails}
        autoFocus
      />
      {failed ? <Banner tone="error">Could not add contacts. Try again.</Banner> : null}
      {chips.length === 0 ? (
        <Hint>
          <Icon icon={Sparkles} size={14} />
          Paste a whole list — we&apos;ll split it.
        </Hint>
      ) : (
        <Hint role="status">{summary}</Hint>
      )}
    </ResponsiveDialog>
  );
}
