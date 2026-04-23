import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Route wrapper that permits both signed-in users and guests through. Used
 * for the "sign a PDF" flow (upload → editor → sent) which is explicitly
 * available without an account. Anonymous users still get bounced to sign-in.
 */
export function RequireAuthOrGuest() {
  const { user, guest, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (!user && !guest) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
