import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { useAuth } from '@/providers/AuthProvider';

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

  return <AuthLoadingScreen />;
}
