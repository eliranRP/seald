import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Decides where `/` should land based on auth state + viewport:
 * - signed in + mobile-web (≤ 640 px) → `/m/send` (sender mobile flow)
 * - signed in + desktop → `/documents`
 * - guest → `/document/new`
 * - anonymous → `/signin`
 */
export function RootLanding() {
  const { user, guest, loading } = useAuth();
  const isMobile = useIsMobileViewport();
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    return <Navigate to={isMobile ? '/m/send' : '/documents'} replace />;
  }
  if (guest) {
    return <Navigate to={isMobile ? '/m/send' : '/document/new'} replace />;
  }
  return <Navigate to="/signin" replace />;
}
