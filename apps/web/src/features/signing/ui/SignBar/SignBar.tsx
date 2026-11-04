import { Asterisk, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { useT } from '@/lib/i18n';
import { Action, Bar, Count, Note, Progress, Track } from './SignBar.styles';
import type { SignBarProps } from './SignBar.types';

/** Progress over the required, hand-filled fields and the Next / Finish action. */
export function SignBar(props: SignBarProps) {
  const { done, total, optionalLeft, ready, onNext, onFinish } = props;
  const t = useT();
  const count = t('signing.sign.bar.progress', { done, total });

  return (
    <Bar role="region" aria-label={t('signing.sign.bar.aria')}>
      <Progress>
        <Track>
          <ProgressBar
            value={done}
            max={Math.max(1, total)}
            tone={ready ? 'success' : 'indigo'}
            label={count}
          />
        </Track>
        <Count>{count}</Count>
        {ready && optionalLeft > 0 ? (
          <Note>
            <Icon icon={Asterisk} size={12} />
            {t('signing.sign.bar.optional', { count: optionalLeft })}
          </Note>
        ) : null}
        {!ready ? <Note>{t('signing.sign.bar.required')}</Note> : null}
      </Progress>
      <Action>
        {ready ? (
          <Button iconLeft={Check} onClick={onFinish} fullWidth>
            {t('signing.sign.bar.finish')}
          </Button>
        ) : (
          <Button iconRight={ChevronRight} onClick={onNext} fullWidth>
            {t('signing.sign.bar.next')}
          </Button>
        )}
      </Action>
    </Bar>
  );
}
