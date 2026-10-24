import { Clock } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StatusPage } from '@/features/signing/ui/StatusPage';
import { useT } from '@/lib/i18n';
import { Label, Line, Step, Steps } from './NotYourTurn.styles';

export interface NotYourTurnProps {
  /** Shows a "Check again" button that re-runs the failed request. */
  readonly onRetry?: (() => void) | undefined;
  /** First name of the signer who is up. */
  readonly waitingOn?: string | undefined;
  readonly senderName?: string | undefined;
}

/**
 * Signer-facing page for the API's `409 not_your_turn` (WP-06). The sender
 * set a signing order and an earlier step has not finished, so this is
 * not an error: nothing is wrong and the signer has nothing to do yet.
 */
export function NotYourTurn({ onRetry, waitingOn, senderName }: NotYourTurnProps) {
  const t = useT();
  return (
    <StatusPage tone="neutral" icon={Clock} title={t('signing.sign.link.notYet.title')}>
      <Steps role="status" aria-live="polite">
        <Step>
          <Avatar name={senderName ?? '?'} size={36} tone="emerald" />
          <Label>{t('signing.sign.link.notYet.sent')}</Label>
        </Step>
        <Line aria-hidden="true" />
        <Step>
          <Avatar name={waitingOn ?? '?'} size={36} tone="amber" />
          <Label $strong>
            {waitingOn
              ? t('signing.sign.link.notYet.first', { name: waitingOn })
              : t('signing.sign.link.notYet.firstAnon')}
          </Label>
        </Step>
        <Line aria-hidden="true" />
        <Step>
          <Avatar name={t('signing.sign.link.notYet.you')} size={36} tone="indigo" />
          <Label>{t('signing.sign.link.notYet.you')}</Label>
        </Step>
      </Steps>
      <span>{t('signing.sign.link.notYet.body')}</span>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {t('signing.sign.link.notYet.checkAgain')}
        </Button>
      ) : null}
    </StatusPage>
  );
}
