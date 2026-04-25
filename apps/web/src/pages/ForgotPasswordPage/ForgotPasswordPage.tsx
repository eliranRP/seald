import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';

/**
 * L4 page — `/forgot-password`. After a successful submit, routes the user
 * to `/check-email?email=…&mode=reset` so the post-submit copy can reference
 * the address they entered.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const handleSubmitted = useCallback(
    (email: string): void => {
      navigate(`/check-email?email=${encodeURIComponent(email)}&mode=reset`);
    },
    [navigate],
  );

  const handleSwitch = useCallback(
    (next: AuthFormMode): void => {
      navigate(pathForAuthMode(next));
    },
    [navigate],
  );

  return (
    <AuthShell>
      <AuthForm mode="forgot" onForgotSubmitted={handleSubmitted} onSwitchMode={handleSwitch} />
    </AuthShell>
  );
}
