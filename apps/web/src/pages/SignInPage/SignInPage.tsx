import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';
import { useAuth } from '@/providers/AuthProvider';

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.color.danger[50]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
  margin: 0 0 ${({ theme }) => theme.space[4]};
`;

const ERROR_COPY: Record<string, string> = {
  oauth: "We couldn't complete the Google sign-in. Please try again.",
};

/**
 * L4 page — `/signin`. Thin wrapper over `AuthShell` + `AuthForm` that wires
 * the form's success/skip/mode-switch callbacks to router navigation. When
 * `AuthCallbackPage` redirects here after a failed OAuth handshake it appends
 * `?error=oauth`, which we surface in a banner above the form.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { enterGuestMode } = useAuth();
  const errorKey = params.get('error');

  const handleSkip = useCallback((): void => {
    enterGuestMode();
    navigate('/document/new');
  }, [enterGuestMode, navigate]);

  const handleSwitch = useCallback(
    (next: AuthFormMode): void => {
      navigate(pathForAuthMode(next));
    },
    [navigate],
  );

  const handleForgot = useCallback((): void => {
    navigate('/forgot-password');
  }, [navigate]);

  const handleAuthed = useCallback((): void => {
    navigate('/documents');
  }, [navigate]);

  return (
    <AuthShell>
      {errorKey ? (
        <ErrorBanner role="alert">
          {ERROR_COPY[errorKey] ?? 'Something went wrong. Please try again.'}
        </ErrorBanner>
      ) : null}
      <AuthForm
        mode="signin"
        onSkip={handleSkip}
        onForgotPassword={handleForgot}
        onSwitchMode={handleSwitch}
        onAuthed={handleAuthed}
      />
    </AuthShell>
  );
}
