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
  return (
    <Page>
      <Card role="status" aria-live="polite">
        <Title>It&apos;s not your turn to sign yet</Title>
        <Body>
          The sender asked for this document to be signed in order. Someone ahead of you still needs
          to sign first.
        </Body>
        <Body>
          There is nothing you need to do right now. We&apos;ll email you a signing link as soon as
          it&apos;s your turn.
        </Body>
        {onRetry ? (
          <RetryButton type="button" onClick={onRetry}>
            Check again
          </RetryButton>
        ) : null}
      </Card>
    </Page>
  );
}
