import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthShell } from '../../components/AuthShell';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../providers/AuthProvider';
import { Actions, Body, IconBadge, Primary, Secondary, Title, Wrap } from './CheckEmailPage.styles';

/**
 * L4 page — `/check-email`. Shown after either:
 *  - forgot-password submit (`mode=reset`) — offers "Resend link"
 *  - signup with email confirmation required (`mode=signup`) — mirrors the
 *    same copy but without a resend action (Supabase sends its own).
 */
export function CheckEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const email = params.get('email') ?? '';
  const mode = params.get('mode') === 'signup' ? 'signup' : 'reset';
  const [resendBusy, setResendBusy] = useState(false);

  const handleBack = useCallback((): void => {
    navigate('/signin');
  }, [navigate]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (!email || resendBusy) return;
    setResendBusy(true);
    try {
      await resetPassword(email);
    } finally {
      setResendBusy(false);
    }
  }, [email, resendBusy, resetPassword]);

  const body =
    mode === 'signup' ? (
      <>
        We sent a confirmation link to <strong>{email || 'your inbox'}</strong>. Click it to
        activate your account.
      </>
    ) : (
      <>
        We sent a password reset link to <strong>{email || 'your inbox'}</strong>. It&apos;ll expire
        in 30 minutes.
      </>
    );

  return (
    <AuthShell>
      <Wrap>
        <IconBadge>
          <Icon icon={MailCheck} size={26} />
        </IconBadge>
        <Title>Check your email</Title>
        <Body>{body}</Body>
        <Actions>
          <Secondary type="button" onClick={handleBack}>
            Back to sign in
          </Secondary>
          {mode === 'reset' ? (
            <Primary type="button" onClick={handleResend} disabled={resendBusy || !email}>
              {resendBusy ? 'Sending…' : 'Resend link'}
            </Primary>
          ) : null}
        </Actions>
      </Wrap>
    </AuthShell>
  );
}
