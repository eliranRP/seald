import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { apiFetch } from '../../lib/api/apiFetch';
import { supabase } from '../../lib/supabase/supabaseClient';
import { Actions, Card, Result, Status, Title, Wrap } from './DebugAuthPage.styles';

/**
 * L4 page — developer-only surface for exercising the Supabase → `/me` path
 * end-to-end. Shows the current session email, a sign-in/sign-out toggle, and
 * a button that calls the protected `GET /me` on the API using `apiFetch` so
 * you can see the Authorization header being attached in practice.
 *
 * Not linked from the main NavBar on purpose — it's a debug surface at
 * `/debug/auth`.
 */
export function DebugAuthPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [meResult, setMeResult] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/debug/auth` },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMeResult('');
  }, []);

  const callMe = useCallback(async () => {
    const res = await apiFetch('/me');
    const text = await res.text();
    setMeResult(`${res.status} ${text}`);
  }, []);

  return (
    <Wrap>
      <Card>
        <Title>Auth debug</Title>
        <Status>Signed in as: {email ?? '(none)'}</Status>
        <Actions>
          {email ? (
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          ) : (
            <Button variant="primary" onClick={signIn}>
              Sign in with Google
            </Button>
          )}
          <Button variant="secondary" onClick={callMe} disabled={!email}>
            Call /me
          </Button>
        </Actions>
        {meResult ? <Result>{meResult}</Result> : null}
      </Card>
    </Wrap>
  );
}
