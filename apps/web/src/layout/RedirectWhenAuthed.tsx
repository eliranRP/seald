import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Inverse guard used for the auth pages themselves: if the user is already
 * signed in, bounce them to `/documents`. The dashboard adapts to mobile,
 * and product (2026-05-03) wants Documents to be the post-auth landing on
 * every viewport so users see their existing envelopes — the mobile sender
 * lives within Documents. Guests stay put so they can still reach sign-in /
 * sign-up from the NavBar CTA buttons.
 */
export function RedirectWhenAuthed() {
  const { user, loading } = useAuth();
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    return <Navigate to="/documents" replace />;
  }
  return <Outlet />;
}
