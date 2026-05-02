import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Inverse guard used for the auth pages themselves: if the user is already
 * signed in, bounce them to the right post-auth surface for their viewport
 * (mobile-web ≤ 640 px → /m/send; desktop → /documents). Guests stay put so
 * they can still reach sign-in / sign-up from the NavBar CTA buttons.
 */
export function RedirectWhenAuthed() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobileViewport();
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    return <Navigate to={isMobile ? '/m/send' : '/documents'} replace />;
  }
  return <Outlet />;
}
