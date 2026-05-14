import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/providers/AuthProvider';
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
  const { resetPassword, resendSignUpConfirmation } = useAuth();
  const email = params.get('email') ?? '';
  const mode = params.get('mode') === 'signup' ? 'signup' : 'reset';
  const [resendBusy, setResendBusy] = useState(false);

  const handleBack = useCallback((): void => {
    navigate('/signin');
  }, [navigate]);

  // Reset mode resends the password-reset link; signup mode resends the
  // confirmation email (audit C: CheckEmail #14). Both share the busy /
  // disabled affordance so a click while pending is a no-op.
  const handleResend = useCallback(async (): Promise<void> => {
    if (!email || resendBusy) return;
    setResendBusy(true);
    try {
      if (mode === 'signup') {
        await resendSignUpConfirmation(email);
      } else {
        await resetPassword(email);
      }
    } finally {
      setResendBusy(false);
    }
  }, [email, mode, resendBusy, resetPassword, resendSignUpConfirmation]);

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

  // Bug C fix (audit 2026-05-02): the confirmation copy is the single
  // most important message on the page — without role=status + aria-live
  // the user (especially on a screen reader, who only hears the new
  // heading after the route transition) loses all context for what just
  // happened. The aria-label is mode-specific so the role announcement
  // is meaningful even before the body text is read.
  const statusLabel =
    mode === 'signup'
      ? 'Confirmation link sent — check your email'
      : 'Password reset link sent — check your email';

  return (
    <AuthShell>
      <Wrap>
        <IconBadge>
          <Icon icon={MailCheck} size={26} />
        </IconBadge>
        <Title>Check your email</Title>
        <Body role="status" aria-live="polite" aria-label={statusLabel}>
          {body}
        </Body>
        <Actions>
          <Secondary type="button" onClick={handleBack}>
            Back to sign in
          </Secondary>
          <Primary type="button" onClick={handleResend} disabled={resendBusy || !email}>
            {resendBusy
              ? 'Sending…'
              : mode === 'signup'
                ? 'Resend confirmation email'
                : 'Resend link'}
          </Primary>
        </Actions>
      </Wrap>
    </AuthShell>
  );
}
