import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { apiClient } from '../../lib/api/apiClient';
import { supabase } from '../../lib/supabase/supabaseClient';
import { Actions, Card, Result, Status, Title, Wrap } from './DebugAuthPage.styles';

/**
 * L4 page — developer-only surface for exercising the Supabase → `/me` path
 * end-to-end. Shows the current session email, a sign-in/sign-out toggle,
 * and a button that calls the protected `GET /me` on the API using the
 * shared axios client (so the Authorization interceptor runs end-to-end).
 *
 * In-flight `/me` calls are attached to an `AbortController` that is
 * canceled on unmount, so leaving the page mid-request doesn't race with
 * state updates on an unmounted component.
 *
 * Not linked from the main NavBar — it's a debug surface at `/debug/auth`.
 */
export function DebugAuthPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [meResult, setMeResult] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

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
      abortRef.current?.abort();
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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await apiClient.get('/me', { signal: controller.signal });
      setMeResult(`${res.status} ${JSON.stringify(res.data)}`);
    } catch (err) {
      const wrapped = err as Error & { readonly status?: number };
      if (wrapped.name === 'CanceledError' || wrapped.name === 'AbortError') return;
      setMeResult(`${wrapped.status ?? 'ERR'} ${wrapped.message}`);
    }
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
