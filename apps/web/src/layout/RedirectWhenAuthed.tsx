import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Inverse guard used for the auth pages themselves: if the user is already
 * signed in, bounce them to the dashboard. Guests stay put so they can still
 * reach sign-in / sign-up from the NavBar CTA buttons.
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
