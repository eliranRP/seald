import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';
import { useAuth } from '@/providers/AuthProvider';

/**
 * L4 page — `/signup`. Handles three post-submit outcomes:
 * 1. Immediate session → navigate to `/documents`.
 * 2. Email-confirmation required → navigate to `/check-email?email=…`.
 * 3. Skip → enter guest mode + land on `/document/new`.
 */
export function SignUpPage() {
  const navigate = useNavigate();
  const { enterGuestMode } = useAuth();

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

  const handleNeedsEmail = useCallback(
    (email: string): void => {
      navigate(`/check-email?email=${encodeURIComponent(email)}&mode=signup`);
    },
    [navigate],
  );

  const handleAuthed = useCallback((): void => {
    navigate('/documents');
  }, [navigate]);

  return (
    <AuthShell>
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
