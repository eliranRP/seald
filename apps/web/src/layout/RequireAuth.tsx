import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Route wrapper for surfaces that only signed-in users can reach
 * (dashboard, signers, email previews).
 *
 * - Signed-in → renders the child route.
 * - Guest → redirected to `/document/new` (their allowed surface) rather
 *   than `/signin`, matching the spec's persona→route table.
 * - Anonymous → `/signin`.
 * - Loading → full-page spinner to avoid redirect flicker during the first
 *   `getSession()` resolution.
 */
export function RequireAuth() {
  const { user, guest, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    return <Outlet />;
  }
  if (guest) {
    return <Navigate to="/document/new" replace />;
  }
  return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
}
