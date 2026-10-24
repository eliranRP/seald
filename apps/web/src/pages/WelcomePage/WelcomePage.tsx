import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';
import { WelcomeStep } from '@/components/WelcomeStep';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { takeRememberedNext } from '@/layout/nextPath';
import { readProfileState } from '@/lib/auth/profileState';
import { useAuth } from '@/providers/AuthProvider';

/**
 * L4 page: `/welcome`, the one extra step for a new account (name + terms)
 * after its first sign-in. Without a session it goes to `/signin`. Once the
 * profile is complete (just saved, or reloaded after saving) it continues to
 * the parked `?next=` or `/documents`.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const { user, session, loading, completeProfile } = useAuth();
  const landed = useRef(false);
  const profile = readProfileState(session);
  const done = !loading && user !== null && !profile.needsWelcome;

  // One job: leave once the profile is complete. The ref keeps a repeated
  // run from taking an already-emptied `next` slot and overriding it.
  useEffect(() => {
    if (!done || landed.current) return;
    landed.current = true;
    navigate(takeRememberedNext() ?? '/documents', { replace: true });
  }, [done, navigate]);

  if (loading || done) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;

  return (
    <AuthSplitLayout>
      <WelcomeStep email={user.email} initialName={profile.name} onSubmit={completeProfile} />
    </AuthSplitLayout>
  );
}
