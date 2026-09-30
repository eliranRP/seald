import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { AuthLoadingScreen } from './AuthLoadingScreen';

/**
 * Inverse guard for the auth pages. Signed-in visitors are bounced off
 * /signin / /signup so they don't see a stale form. Per product
 * (2026-05-03, refined), the desktop dashboard at /documents and the
 * rest of the AppShell-hosted desktop surfaces weren't designed for a
 * 390 px viewport (table cells overlap, hero text wraps, the title
 * char-stacks). Rather than retrofit responsiveness onto every desktop
 * page, mobile users are locked to the dedicated mobile sender at
 * /m/send. Desktop visitors still land on /documents. Guests stay put
 * so they can still reach the auth CTAs.
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
