import { useT } from '@/lib/i18n';
import { Body, Card, Page, RetryButton, Title } from './NotYourTurn.styles';

export interface NotYourTurnProps {
  /** Shows a "Check again" button that re-runs the failed request. */
  readonly onRetry?: (() => void) | undefined;
}

/**
 * Signer-facing page for the API's `409 not_your_turn` (WP-06). The sender
 * set a signing order and an earlier step has not finished, so this is
 * not an error: nothing is wrong and the signer has nothing to do yet.
 */
export function NotYourTurn({ onRetry }: NotYourTurnProps) {
  const t = useT();
  return (
    <Page>
      <Card role="status" aria-live="polite">
        <Title>{t('signing.notYourTurn.title')}</Title>
        <Body>{t('signing.notYourTurn.body')}</Body>
        <Body>{t('signing.notYourTurn.nothingToDo')}</Body>
        {onRetry ? (
          <RetryButton type="button" onClick={onRetry}>
            {t('signing.notYourTurn.checkAgain')}
          </RetryButton>
        ) : null}
      </Card>
    </Page>
  );
}
