import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLoadingScreen } from '../../layout/AuthLoadingScreen';
import { useAuth } from '../../providers/AuthProvider';

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
    if (params.get('error')) {
      navigate('/signin?error=oauth', { replace: true });
    }
  }, [params, navigate]);

  useEffect(() => {
    if (!loading && user) {
      navigate('/documents', { replace: true });
    }
  }, [loading, user, navigate]);

  return <AuthLoadingScreen />;
}
