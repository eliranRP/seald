import { useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';

export type MagicLinkResult = 'ok' | 'rate_limited' | 'error';

/** Seconds the UI waits after Supabase throttles magic-link sends. */
export const RATE_LIMIT_WAIT_S = 60;

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit']);

/**
 * True for the Supabase OTP throttle: HTTP 429 or one of its rate-limit
 * error codes (auth-js puts both on the thrown `AuthApiError`).
 */
export function isRateLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, code } = err as { status?: unknown; code?: unknown };
  if (status === 429) return true;
  return typeof code === 'string' && RATE_LIMIT_CODES.has(code);
}

/**
 * Sends a magic link and folds the outcome into one of three results, so the
 * auth page and the check-email panel share the same error handling.
 */
export function useSendMagicLink(): (email: string) => Promise<MagicLinkResult> {
  const { signInWithEmailLink } = useAuth();
  return useCallback(
    async (email: string): Promise<MagicLinkResult> => {
      try {
        await signInWithEmailLink(email);
        return 'ok';
      } catch (err) {
        return isRateLimitError(err) ? 'rate_limited' : 'error';
      }
    },
    [signInWithEmailLink],
  );
}
