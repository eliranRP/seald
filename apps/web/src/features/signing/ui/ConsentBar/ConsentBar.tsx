import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { useT } from '@/lib/i18n';
import {
  Agree,
  Asked,
  Bar,
  DisclosureLink,
  ErrorLine,
  Meta,
  Who,
  WhoText,
} from './ConsentBar.styles';
import type { ConsentBarProps } from './ConsentBar.types';

/** Roughly 20 seconds a field, at least a minute. */
function minutesFor(fieldCount: number): number {
  return Math.max(1, Math.round((fieldCount * 20) / 60));
}

/**
 * The one consent step. One checkbox covers the electronic-signature
 * agreement; Start records it (terms accepted + ESIGN disclosure
 * acknowledged) and opens the document for filling.
 */
export function ConsentBar(props: ConsentBarProps) {
  const {
    senderName,
    fieldCount,
    agreed,
    onAgreedChange,
    onStart,
    busy = false,
    disclosureHref,
    attestation,
    error,
  } = props;
  const t = useT();

  return (
    <Bar aria-label={t('signing.sign.consent.aria')}>
      <Who>
        <Avatar name={senderName ?? '?'} size={36} />
        <WhoText>
          <Asked>
            {senderName
              ? t('signing.sign.consent.asked', { sender: senderName })
              : t('signing.sign.consent.askedAnon')}
          </Asked>
          <Meta>
            {fieldCount === 1
              ? t('signing.sign.consent.fieldsOne')
              : t('signing.sign.consent.fieldsMany', {
                  count: fieldCount,
                  minutes: minutesFor(fieldCount),
                })}
          </Meta>
        </WhoText>
      </Who>
      <Agree>
        <Checkbox
          checked={agreed}
          onChange={onAgreedChange}
          label={t('signing.sign.consent.agree')}
          hint={t('signing.sign.consent.alsoConfirm', { statement: attestation })}
          disabled={busy}
        />
        <DisclosureLink href={disclosureHref} target="_blank" rel="noopener noreferrer">
          {t('signing.sign.consent.disclosure')}
        </DisclosureLink>
      </Agree>
      <Button onClick={onStart} disabled={!agreed || busy} loading={busy}>
        {t('signing.sign.consent.start')}
      </Button>
      {error ? <ErrorLine role="alert">{error}</ErrorLine> : null}
    </Bar>
  );
}
