import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { useAuth } from '@/providers/AuthProvider';
import { ApprovalsNotFound } from './ApprovalsNotFound';
import { isApprovalsEnabled, signInPathFor } from './model';

/**
 * Guard for `/approve/:id` and `/approve/:id/review`. Flag off renders the
 * not-found page. Without a signed-in account (guests have no email, so no
 * approvals) the owner goes to `/signin?next=<this path>` and comes back to
 * the same card or review after signing in. `RequireAuth` cannot do this
 * because it sends no `?next=`.
 */
export function RequireOwnerSession() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!isApprovalsEnabled()) return <ApprovalsNotFound />;
  if (loading) return <AuthLoadingScreen />;
  if (!user) {
    // `reauth` starts a fresh sign-in; the return trip must not repeat it.
    const query = new URLSearchParams(location.search);
    query.delete('reauth');
    const search = query.toString();
    const target = search ? `${location.pathname}?${search}` : location.pathname;
    return <Navigate to={signInPathFor(target)} replace />;
  }
  return <Outlet />;
}
