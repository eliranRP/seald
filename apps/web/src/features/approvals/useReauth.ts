import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { signInPathFor } from './model';

/**
 * Approve needs a sign-in from the last 12 hours (`fresh_login_required`).
 * A stale session that visits `/signin` is bounced straight back by
 * `RedirectWhenAuthed`, so the sign-in has to start from a signed-out
 * state. This signs out and sends the owner to `/signin?next=<path>`;
 * after signing in they land on the same approval card, Approve ready.
 */
export function useReauth(returnPath: string): () => Promise<void> {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return useCallback(async (): Promise<void> => {
    await signOut().catch(() => undefined);
    navigate(signInPathFor(returnPath), { replace: true });
  }, [navigate, returnPath, signOut]);
}
