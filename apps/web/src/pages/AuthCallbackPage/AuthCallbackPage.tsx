import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthFormColumn, AuthMeta, AuthSplitLayout } from '@/components/AuthSplitLayout';
import { Spinner } from '@/components/Spinner';
import { takeRememberedNext } from '@/layout/nextPath';
import { readProfileState } from '@/lib/auth/profileState';
import { useAuth } from '@/providers/AuthProvider';

/**
 * 10-second watchdog before bouncing to `/signin?error=oauth_timeout`
 * (audit C: AuthCallback #20). Without this, a Supabase failure mode
 * where `detectSessionInUrl` never settles would leave the user staring
 * at the loading screen forever.
 */
const OAUTH_WATCHDOG_MS = 10_000;

/**
 * Maps a failed return to the `/signin?error=` key. Supabase reports an
 * expired or already-used magic link as `error_code=otp_expired` in the URL
 * hash (query for PKCE); every other provider error is an OAuth failure.
 */
function callbackErrorKey(search: URLSearchParams, hash: string): 'link_expired' | 'oauth' | null {
  const fromHash = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const code = search.get('error_code') ?? fromHash.get('error_code');
  if (code === 'otp_expired') return 'link_expired';
  if (search.get('error') || fromHash.get('error')) return 'oauth';
  return null;
}

/**
 * L4 page — `/auth/callback`. Supabase redirects back here after an OAuth
 * flow with session tokens in the URL. The Supabase client picks them up
 * automatically (`detectSessionInUrl: true`); we just have to wait for the
 * `AuthProvider` to observe the session, then route onward.
 *
 * If Supabase reports an error (query or URL hash) we bounce the user to
 * `/signin?error=oauth` (or `link_expired` for a dead magic link) so the
 * sign-in page can surface the problem. A new account continues to
 * `/welcome` before the dashboard.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, session, loading } = useAuth();
  const landed = useRef(false);

  useEffect(() => {
    // Defence in depth: when the provider returns an error AND a stale
    // session somehow co-exists, the error redirect must win — otherwise
    // we'd silently land the user on /documents and swallow the failure.
    // Run both checks in a single effect with explicit precedence so the
    // outcome doesn't depend on effect-flush order.
    const errorKey = callbackErrorKey(params, window.location.hash);
    if (errorKey) {
      navigate(`/signin?error=${errorKey}`, { replace: true });
      return;
    }
    if (!loading && user && !landed.current) {
      // A parked `?next=` (an approval review the owner started from) wins
      // over the dashboard. It is validated again when taken. The ref keeps
      // a repeated effect run from taking an already-emptied slot and
      // overriding it with the dashboard.
      landed.current = true;
      // A new account owes a name and the terms first; the parked `?next=`
      // stays in place for after /welcome.
      if (readProfileState(session).needsWelcome) {
        navigate('/welcome', { replace: true });
        return;
      }
      navigate(takeRememberedNext() ?? '/documents', { replace: true });
    }
  }, [params, loading, user, session, navigate]);

  // Watchdog — armed for as long as no user has arrived, whether the
  // provider is still loading or settled without a session (a dead or
  // replayed link with no error in the URL). Either way, after 10 seconds
  // the user gets an actionable error on /signin instead of a spinner that
  // never ends. A user arriving tears it down (and the effect above routes
  // onward).
  useEffect(() => {
    if (user) return undefined;
    const timer = setTimeout(() => {
      navigate('/signin?error=oauth_timeout', { replace: true });
    }, OAUTH_WATCHDOG_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [user, navigate]);

  return (
    <AuthSplitLayout>
      <AuthFormColumn $center>
        <Spinner size="lg" />
        <AuthMeta role="status">Signing you in…</AuthMeta>
      </AuthFormColumn>
    </AuthSplitLayout>
  );
}
