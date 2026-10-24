import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { readProfileState } from '../lib/auth/profileState';
import { useAuth } from '../providers/AuthProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';
import { readNextParam } from './nextPath';

/**
 * Inverse guard for the auth pages. Signed-in visitors are bounced off
 * /signin / /signup to /documents so they don't see a stale form — on any
 * viewport: the v2 AppShell screens are responsive, so phones are no
 * longer locked to /m/send. Guests stay put so they can still reach the
 * auth CTAs.
 *
 * A brand-new account (no profile name yet) is sent to `/welcome` first.
 *
 * A validated `?next=` (an `/approve/…` path, see `nextPath.ts`) wins over
 * both defaults, so an owner who signs in from the approval review goes
 * back to the review on any viewport.
 */
export function RedirectWhenAuthed() {
  const { user, session, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (user) {
    // A brand-new account still owes a name and the terms (`/welcome`).
    if (readProfileState(session).needsWelcome) {
      return <Navigate to="/welcome" replace />;
    }
    const next = readNextParam(params);
    return <Navigate to={next ?? '/documents'} replace />;
  }
  return <Outlet />;
}
