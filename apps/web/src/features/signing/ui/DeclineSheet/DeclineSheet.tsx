import { useState } from 'react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { SheetDialog } from '@/components/SheetDialog';
import { useT } from '@/lib/i18n';
import type { CommonKey } from '@/lib/i18n';
import { composeDeclineReason } from './composeDeclineReason';
import { Chip, Chips, Note } from './DeclineSheet.styles';
import type { DeclineChip, DeclineSheetProps } from './DeclineSheet.types';

const CHIPS: ReadonlyArray<{ readonly id: DeclineChip; readonly key: CommonKey }> = [
  { id: 'wrong_person', key: 'signing.sign.decline.wrongPerson' },
  { id: 'terms', key: 'signing.sign.decline.terms' },
  { id: 'other', key: 'signing.sign.decline.other' },
];

/**
 * Decline sheet: reason chips and an optional note, both going to the
 * sender. Composed into the API's single `reason` string.
 */
export function DeclineSheet(props: DeclineSheetProps) {
  const { open, onClose, senderName, busy = false, error, onConfirm } = props;
  const t = useT();
  const [chip, setChip] = useState<DeclineChip | null>(null);
  const [note, setNote] = useState('');
  const notePlaceholder = senderName
    ? t('signing.sign.decline.noteTo', { sender: senderName })
    : t('signing.sign.decline.note');

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={t('signing.sign.decline.title')}
      closeLabel={t('signing.sign.decline.close')}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('signing.sign.decline.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy}
            onClick={() => onConfirm(composeDeclineReason(chip, note))}
          >
            {t('signing.sign.decline.confirm')}
          </Button>
        </>
      }
    >
      <Chips role="group" aria-label={t('signing.sign.decline.reason')}>
        {CHIPS.map((c) => (
          <Chip
            key={c.id}
            type="button"
            $on={chip === c.id}
            aria-pressed={chip === c.id}
            onClick={() => setChip(chip === c.id ? null : c.id)}
          >
            {t(c.key)}
          </Chip>
        ))}
      </Chips>
      <Note
        aria-label={notePlaceholder}
        placeholder={notePlaceholder}
        maxLength={400}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SheetDialog>
  );
}
