import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { useAuth } from '@/providers/AuthProvider';

/**
 * 10-second watchdog before bouncing to `/signin?error=oauth_timeout`
 * (audit C: AuthCallback #20). Without this, a Supabase failure mode
 * where `detectSessionInUrl` never settles would leave the user staring
 * at the loading screen forever.
 */
const OAUTH_WATCHDOG_MS = 10_000;

/**
 * L4 page — `/auth/callback`. Supabase redirects back here after an OAuth
 * flow with session tokens in the URL. The Supabase client picks them up
 * automatically (`detectSessionInUrl: true`); we just have to wait for the
 * `AuthProvider` to observe the session, then route onward.
 *
 * If Supabase reports an error in the query string we bounce the user to
 * `/signin?error=oauth` so the sign-in page can surface the problem.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Defence in depth: when the provider returns an error AND a stale
    // session somehow co-exists, the error redirect must win — otherwise
    // we'd silently land the user on /documents and swallow the failure.
    // Run both checks in a single effect with explicit precedence so the
    // outcome doesn't depend on effect-flush order.
    if (params.get('error')) {
      navigate('/signin?error=oauth', { replace: true });
      return;
    }
    if (!loading && user) {
      navigate('/documents', { replace: true });
    }
  }, [params, loading, user, navigate]);

  // Watchdog — bound to `loading` only so the timer is set once per
  // loading window and torn down once the provider has settled, whether
  // or not a user materialized. If 10 seconds elapse with `loading`
  // still true we bounce to /signin so the user gets an actionable
  // error instead of an indefinite spinner.
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      navigate('/signin?error=oauth_timeout', { replace: true });
    }, OAUTH_WATCHDOG_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [loading, navigate]);

  return <AuthLoadingScreen />;
}
