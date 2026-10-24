import { useId } from 'react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useT } from '@/lib/i18n';
import {
  Agree,
  AgreeBox,
  AgreeHint,
  AgreeLabel,
  AgreeText,
  AgreeTextCol,
  Asked,
  Bar,
  DisclosureLink,
  ErrorLine,
  Meta,
  StartSlot,
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
 *
 * The checkbox is the canvas `.consent-bar label` (16px box, 14px label),
 * not the 44px form `Checkbox` row, so the bar stays one line on desktop.
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
  const labelId = useId();
  const hintId = useId();

  return (
    <Bar aria-label={t('signing.sign.consent.aria')}>
      <Who>
        <Avatar name={senderName ?? '?'} size={36} tone="indigo" />
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
        <AgreeLabel $disabled={busy}>
          <AgreeBox
            type="checkbox"
            checked={agreed}
            disabled={busy}
            aria-labelledby={labelId}
            aria-describedby={hintId}
            onChange={(event) => {
              onAgreedChange(event.currentTarget.checked);
            }}
          />
          <AgreeTextCol>
            <AgreeText id={labelId}>{t('signing.sign.consent.agree')}</AgreeText>
            <AgreeHint id={hintId}>
              {t('signing.sign.consent.alsoConfirm', { statement: attestation })}
            </AgreeHint>
          </AgreeTextCol>
        </AgreeLabel>
        <DisclosureLink href={disclosureHref} target="_blank" rel="noopener noreferrer">
          {t('signing.sign.consent.disclosure')}
        </DisclosureLink>
      </Agree>
      <StartSlot>
        <Button onClick={onStart} disabled={!agreed || busy} loading={busy} fullWidth>
          {t('signing.sign.consent.start')}
        </Button>
      </StartSlot>
      {error ? <ErrorLine role="alert">{error}</ErrorLine> : null}
    </Bar>
  );
}
