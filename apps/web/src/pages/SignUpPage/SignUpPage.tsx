import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';
import { useAuth } from '@/providers/AuthProvider';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';

const ErrorBanner = styled(SharedErrorBanner)`
  margin: 0 0 ${({ theme }) => theme.space[4]};
`;

/**
 * L4 page — `/signup`. Handles three post-submit outcomes:
 * 1. Immediate session → navigate to `/documents`.
 * 2. Email-confirmation required → navigate to `/check-email?email=…`.
 * 3. Skip → enter guest mode + land on `/document/new`.
 */
export function SignUpPage() {
  const navigate = useNavigate();
  const { enterGuestMode } = useAuth();
  const isMobile = useIsMobileViewport();
  const [guestError, setGuestError] = useState<string | null>(null);

  const handleSkip = useCallback((): void => {
    setGuestError(null);
    // Async — provisions an anon Supabase session so the API has a Bearer
    // token to attach. Surface the error if the project disabled the
    // anonymous provider so the user knows to sign up instead.
    enterGuestMode()
      .then(() => navigate(isMobile ? '/m/send' : '/document/new'))
      .catch((err: unknown) => {
        setGuestError(err instanceof Error ? err.message : 'Could not start guest session.');
      });
  }, [enterGuestMode, isMobile, navigate]);

  const handleSwitch = useCallback(
    (next: AuthFormMode): void => {
      navigate(pathForAuthMode(next));
    },
    [navigate],
  );

  const handleNeedsEmail = useCallback(
    (email: string): void => {
      navigate(`/check-email?email=${encodeURIComponent(email)}&mode=signup`);
    },
    [navigate],
  );

  const handleAuthed = useCallback((): void => {
    // Per product (2026-05-03, refined): mirror of SignInPage.handleAuthed —
    // the desktop dashboard wasn't designed for 390 px, so mobile users are
    // locked to the dedicated mobile sender at /m/send after sign-up.
    // Desktop visitors still land on /documents.
    navigate(isMobile ? '/m/send' : '/documents');
  }, [isMobile, navigate]);

  return (
    <AuthShell>
      {guestError ? <ErrorBanner role="alert">{guestError}</ErrorBanner> : null}
      <AuthForm
        mode="signup"
        onSkip={handleSkip}
        onSwitchMode={handleSwitch}
        onNeedsEmailConfirmation={handleNeedsEmail}
        onAuthed={handleAuthed}
      />
    </AuthShell>
  );
}
