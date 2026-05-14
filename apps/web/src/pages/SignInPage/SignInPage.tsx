import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';
import { useAuth } from '@/providers/AuthProvider';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';

/**
 * Icon-led error banner mirroring `DisconnectModal.tsx` `ErrorRow`
 * (`apps/web/src/routes/settings/integrations/DisconnectModal.tsx:106-117`).
 * Adds an `<AlertTriangle>` glyph so the OAuth/guest error is visually
 * distinct from the cookie banner overlay (audit C: SignIn #1).
 */
const ErrorBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 ${({ theme }) => theme.space[4]};
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const ERROR_COPY: Record<string, string> = {
  oauth: "We couldn't complete the Google sign-in. Please try again.",
  oauth_timeout: 'The sign-in took too long. Please try again.',
  guest: "We couldn't start a guest session. Please sign up to continue.",
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
  const isMobile = useIsMobileViewport();
  const queryError = params.get('error');
  const [guestError, setGuestError] = useState<string | null>(null);
  const errorKey = guestError ? 'guest' : queryError;

  const handleSkip = useCallback((): void => {
    setGuestError(null);
    // enterGuestMode is async — it provisions an anonymous Supabase session
    // so subsequent API calls have a Bearer JWT. If the project doesn't
    // allow anonymous sign-ins, surface the failure in the existing
    // error banner instead of silently leaving the user stuck.
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

  const handleForgot = useCallback((): void => {
    navigate('/forgot-password');
  }, [navigate]);

  const handleAuthed = useCallback((): void => {
    // Per product (2026-05-03, refined): the desktop dashboard at
    // /documents — and the rest of the AppShell-hosted desktop surfaces —
    // were not designed for a 390 px viewport (table cells overlap, hero
    // text wraps, the title char-stacks). Rather than retrofit
    // responsiveness onto every desktop page, mobile users are locked to
    // the dedicated mobile sender at /m/send. Desktop visitors still
    // land on /documents.
    navigate(isMobile ? '/m/send' : '/documents');
  }, [isMobile, navigate]);

  return (
    <AuthShell>
      {errorKey ? (
        <ErrorBanner role="alert">
          <AlertTriangle width={16} height={16} strokeWidth={1.75} aria-hidden />
          <span>{ERROR_COPY[errorKey] ?? 'Something went wrong. Please try again.'}</span>
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
