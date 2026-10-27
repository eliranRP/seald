import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ClockAlert, ShieldCheck } from 'lucide-react';
import { AuthFormColumn, AuthSplitLayout } from '@/components/AuthSplitLayout';
import { CheckEmailPanel } from '@/components/CheckEmailPanel';
import { MagicLinkForm } from '@/components/MagicLinkForm';
import type { MagicLinkNotice } from '@/components/MagicLinkForm';
import { RATE_LIMIT_WAIT_S, useSendMagicLink } from '@/lib/auth/magicLink';
import { readNextParam, rememberNext } from '@/layout/nextPath';
import { useAuth } from '@/providers/AuthProvider';

type Phase = 'form' | 'sending' | 'sent';

const GOOGLE_ERROR = "Google sign-in didn't finish. Try again.";
// The callback watchdog fires for a magic link as well as for Google, so it
// names neither: what happened, then the way out.
const TIMEOUT_ERROR = "Sign-in didn't finish. Continue with Google or email yourself a new link.";
const SEND_ERROR = "We couldn't send the link. Try again.";
const GUEST_ERROR = "We couldn't start a guest session. Please sign in to continue.";
const RATE_LIMIT_ERROR = `Too many tries. Wait ${RATE_LIMIT_WAIT_S} s.`;

/**
 * L4 page for `/signin` and `/signup` (one combined screen, the path is kept
 * for old links). Continue with Google or get a magic link by email; the
 * same call signs existing users in and creates new accounts. After the send
 * the form is replaced in place by the "Check your email" panel.
 *
 * Query params: `?next=` (validated in-app path, parked for the round trip
 * through `/auth/callback`), `?email=` (pre-fills the field and shows the
 * "save your signed document" banner, used by the signer Done page) and
 * `?error=oauth|oauth_timeout|link_expired` (set by `AuthCallbackPage`).
 */
export function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { enterGuestMode, signInWithGoogle } = useAuth();
  const sendMagicLink = useSendMagicLink();

  const prefill = params.get('email') ?? '';
  const queryError = params.get('error');
  const next = readNextParam(params);

  const [email, setEmail] = useState(prefill);
  const [phase, setPhase] = useState<Phase>('form');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Retrying dismisses the arrival banner (expired link, Google error).
  const [dismissedQueryError, setDismissedQueryError] = useState(false);

  // One job: park a valid `?next=` for the Google / magic-link round trip,
  // which returns through /auth/callback without the query string.
  useEffect(() => {
    rememberNext(next);
  }, [next]);

  // One job: lift the rate-limit lock after the wait.
  useEffect(() => {
    if (!rateLimited) return undefined;
    const id = window.setTimeout(() => {
      setRateLimited(false);
      setFormError(null);
    }, RATE_LIMIT_WAIT_S * 1000);
    return () => window.clearTimeout(id);
  }, [rateLimited]);

  const deliver = useCallback(
    async (target: string) => {
      const result = await sendMagicLink(target);
      if (result === 'rate_limited') setRateLimited(true);
      return result;
    },
    [sendMagicLink],
  );

  const handleSubmit = useCallback(
    async (target: string): Promise<void> => {
      setFormError(null);
      setDismissedQueryError(true);
      setPhase('sending');
      const result = await deliver(target);
      if (result === 'ok') {
        setPhase('sent');
        return;
      }
      setPhase('form');
      if (result === 'error') setFormError(SEND_ERROR);
    },
    [deliver],
  );

  const handleResend = useCallback(() => deliver(email.trim()), [deliver, email]);

  const handleGoogle = useCallback((): void => {
    setFormError(null);
    setDismissedQueryError(true);
    setGoogleBusy(true);
    signInWithGoogle().catch(() => {
      // No redirect happened, so the user is still here: let them retry.
      setGoogleBusy(false);
      setFormError(GOOGLE_ERROR);
    });
  }, [signInWithGoogle]);

  const handleGuest = useCallback((): void => {
    setFormError(null);
    enterGuestMode()
      .then(() => navigate('/document/new'))
      .catch(() => setFormError(GUEST_ERROR));
  }, [enterGuestMode, navigate]);

  const handleChangeEmail = useCallback((): void => {
    setEmail('');
    setFormError(null);
    setPhase('form');
  }, []);

  const linkExpired = queryError === 'link_expired' && !dismissedQueryError;

  const notice = ((): MagicLinkNotice | undefined => {
    if (rateLimited) return { tone: 'error', icon: ClockAlert, text: RATE_LIMIT_ERROR };
    if (formError) return { tone: 'error', icon: AlertCircle, text: formError };
    if (linkExpired) {
      return {
        tone: 'error',
        icon: ClockAlert,
        text: 'That sign-in link expired. Send a new one.',
      };
    }
    if (queryError === 'oauth' && !dismissedQueryError) {
      return { tone: 'error', icon: AlertCircle, text: GOOGLE_ERROR };
    }
    if (queryError === 'oauth_timeout' && !dismissedQueryError) {
      return { tone: 'error', icon: ClockAlert, text: TIMEOUT_ERROR };
    }
    if (prefill) {
      return { tone: 'info', icon: ShieldCheck, text: 'Save your signed document to your account' };
    }
    return undefined;
  })();

  if (phase === 'sent') {
    return (
      <AuthSplitLayout>
        <CheckEmailPanel
          email={email.trim()}
          onResend={handleResend}
          onChangeEmail={handleChangeEmail}
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <AuthFormColumn>
        <MagicLinkForm
          email={email}
          onEmailChange={setEmail}
          onSubmit={(target) => void handleSubmit(target)}
          onGoogle={handleGoogle}
          onGuest={handleGuest}
          sending={phase === 'sending'}
          googleBusy={googleBusy}
          locked={rateLimited}
          notice={notice}
          submitLabel={linkExpired ? 'Email me a new link' : undefined}
        />
      </AuthFormColumn>
    </AuthSplitLayout>
  );
}
