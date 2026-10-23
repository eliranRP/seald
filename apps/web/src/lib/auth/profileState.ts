import type { Session } from '@supabase/supabase-js';

export interface ProfileState {
  /** Name stored in user metadata, '' when none. */
  readonly name: string;
  /** True for a first sign-in that still owes a name and/or terms acceptance. */
  readonly needsWelcome: boolean;
}

/** A first sign-in is one where last sign-in is within this window of creation. */
const FIRST_SIGN_IN_WINDOW_MS = 2 * 60 * 1000;

/**
 * Reads the onboarding state off a session. Existing users always have a
 * profile name, so they never see `/welcome`. A brand-new account (no name
 * yet, or a first sign-in that has not accepted the terms, e.g. a Google
 * account that arrives with a name) is sent through `/welcome` once.
 */
export function readProfileState(session: Session | null): ProfileState {
  const user = session?.user;
  if (!user || user.is_anonymous) return { name: '', needsWelcome: false };
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.full_name ?? meta.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length === 0) return { name, needsWelcome: true };
  if (typeof meta.terms_accepted_at === 'string') return { name, needsWelcome: false };
  const created = Date.parse(user.created_at);
  const last = Date.parse(user.last_sign_in_at ?? user.created_at);
  const firstSignIn =
    Number.isFinite(created) && Number.isFinite(last) && last - created < FIRST_SIGN_IN_WINDOW_MS;
  return { name, needsWelcome: firstSignIn };
}
