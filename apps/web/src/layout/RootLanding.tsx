import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Decides where `/` should land based on auth state:
 * - signed in → `/documents`
 * - guest → `/document/new`
 * - anonymous → `/signin`
 */
export function RootLanding() {
  const { user, guest, loading } = useAuth();
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    return <Navigate to="/documents" replace />;
  }
  if (guest) {
    return <Navigate to="/document/new" replace />;
  }
  return <Navigate to="/signin" replace />;
}
