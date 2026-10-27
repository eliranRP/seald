import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { AuthFormColumn, AuthMeta, AuthTitle } from '../AuthSplitLayout';
import { Banner } from '../Banner';
import { ButtonRoot } from '../Button/Button.styles';
import { Icon } from '../Icon';
import { Toast } from '../Toast';
import type { CheckEmailPanelProps } from './CheckEmailPanel.types';
import { mailLinksFor } from './mailProviders';
import { MailRow, ResendRow, StateIcon, Strong, TouchButton } from './CheckEmailPanel.styles';

const DEFAULT_COOLDOWN_S = 30;
const RATE_LIMIT_COOLDOWN_S = 60;
const TOAST_MS = 4000;

function formatLeft(seconds: number): string {
  return `0:${String(seconds).padStart(2, '0')}`;
}

/**
 * L3 widget: the "Check your email" state shown after a magic link is sent,
 * both inline on /signin and on the /check-email route. Offers a mail deep
 * link, a Resend that unlocks after a cooldown (local timer, cleared on
 * unmount), and a way back to the start form.
 */
export function CheckEmailPanel(props: CheckEmailPanelProps) {
  const { email, onResend, onChangeEmail, cooldownSeconds = DEFAULT_COOLDOWN_S } = props;
  const [left, setLeft] = useState(cooldownSeconds);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // One job: tick the cooldown down once per second while it is running.
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (busy || left > 0) return;
    setBusy(true);
    setError(null);
    const result = await onResend();
    if (unmounted.current) return;
    setBusy(false);
    if (result === 'ok') {
      setLeft(cooldownSeconds);
      setToast(true);
    } else if (result === 'rate_limited') {
      setLeft(RATE_LIMIT_COOLDOWN_S);
      setError('Too many tries. Wait 60 s.');
    } else {
      setError("We couldn't send the link. Try again.");
    }
  }, [busy, left, onResend, cooldownSeconds]);

  const links = mailLinksFor(email);
  const resendOff = busy || left > 0;
  let resendLabel = 'Resend link';
  if (busy) resendLabel = 'Sending…';
  else if (left > 0) resendLabel = `Resend in ${formatLeft(left)}`;

  return (
    <AuthFormColumn $center>
      <StateIcon aria-hidden="true">
        <Icon icon={Mail} size={32} />
      </StateIcon>
      <AuthTitle>Check your email</AuthTitle>
      <AuthMeta role="status" aria-live="polite" aria-label="Sign-in link sent. Check your email.">
        We sent a link to <Strong>{email || 'your inbox'}</Strong>
      </AuthMeta>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <MailRow>
        {links.map((link) => (
          <ButtonRoot
            key={link.id}
            as="a"
            href={link.href}
            {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            $variant="secondary"
            $size="md"
            $fullWidth={false}
            $iconOnly={false}
          >
            <Icon icon={Mail} size={14} />
            {link.label}
          </ButtonRoot>
        ))}
      </MailRow>
      <ResendRow>
        <AuthMeta>{"Didn't get it?"}</AuthMeta>
        <TouchButton
          variant="ghost"
          size="sm"
          disabled={resendOff}
          onClick={() => void handleResend()}
        >
          {resendLabel}
        </TouchButton>
      </ResendRow>
      <TouchButton variant="ghost" size="sm" onClick={onChangeEmail}>
        Use a different email
      </TouchButton>
      {toast ? (
        <Toast title="New link sent" duration={TOAST_MS} onClose={() => setToast(false)} />
      ) : null}
    </AuthFormColumn>
  );
}
