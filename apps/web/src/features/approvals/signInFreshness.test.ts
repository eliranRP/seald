import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { lastSignInFromToken, needsSignInToApprove } from './signInFreshness';

const NOW = 1_800_000_000_000;
function tok(amr: unknown): string {
  return `h.${btoa(JSON.stringify({ amr })).replace(/=+$/, '')}.s`;
}
const session = (t: string) => ({ access_token: t }) as unknown as Session;

describe('signInFreshness', () => {
  it('reads the newest amr timestamp', () => {
    expect(lastSignInFromToken(tok([{ timestamp: 5 }, { timestamp: 9 }]))).toBe(9);
    expect(lastSignInFromToken('garbage')).toBeNull();
    expect(lastSignInFromToken(null)).toBeNull();
  });
  it('needs a sign-in with no session, no amr, or a sign-in older than 12 hours', () => {
    expect(needsSignInToApprove(null, NOW)).toBe(true);
    expect(needsSignInToApprove(session(tok(null)), NOW)).toBe(true);
    expect(needsSignInToApprove(session(tok([{ timestamp: NOW / 1000 - 13 * 3600 }])), NOW)).toBe(
      true,
    );
    expect(needsSignInToApprove(session(tok([{ timestamp: NOW / 1000 - 3600 }])), NOW)).toBe(false);
  });
});
