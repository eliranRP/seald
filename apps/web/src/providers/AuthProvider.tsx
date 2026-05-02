import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { setKeepSignedIn, supabase } from '../lib/supabase/supabaseClient';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface SignUpOutcome {
  readonly needsEmailConfirmation: boolean;
}

export interface AuthContextValue {
  readonly session: Session | null;
  readonly user: AuthUser | null;
  readonly guest: boolean;
  readonly loading: boolean;
  readonly signInWithPassword: (email: string, password: string, keep: boolean) => Promise<void>;
  readonly signUpWithPassword: (
    name: string,
    email: string,
    password: string,
    keep: boolean,
  ) => Promise<SignUpOutcome>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly resetPassword: (email: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly enterGuestMode: () => Promise<void>;
  readonly exitGuestMode: () => void;
}

/**
 * Exported so Storybook and unit tests can provide a fake context without
 * standing up the full Supabase client. Not intended for application code —
 * production callers must go through `<AuthProvider>` and `useAuth()`.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST_STORAGE_KEY = 'sealed.guest';

function readGuestFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(GUEST_STORAGE_KEY) === '1';
}

function writeGuestFlag(guest: boolean): void {
  if (typeof window === 'undefined') return;
  if (guest) {
    window.localStorage.setItem(GUEST_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(GUEST_STORAGE_KEY);
  }
}

function deriveName(user: User): string {
  const metaName = (user.user_metadata?.name ?? user.user_metadata?.full_name) as
    | string
    | undefined;
  if (metaName && metaName.trim().length > 0) return metaName;
  const email = user.email ?? '';
  return email.length > 0 ? email.split('@')[0]! : 'Signed-in user';
}

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const avatar = user.user_metadata?.avatar_url as string | undefined;
  const base: AuthUser = {
    id: user.id,
    email: user.email ?? '',
    name: deriveName(user),
  };
  return avatar ? { ...base, avatarUrl: avatar } : base;
}

export interface AuthProviderProps {
  readonly children: ReactNode;
}

/**
 * Exposes the Supabase session + a guest flag to the rest of the app.
 *
 * Owns:
 * - `session` / `user` — mirrored from Supabase via `getSession` + `onAuthStateChange`.
 * - `guest` — opt-in "skip sign-up" flag persisted in localStorage. Cleared on
 *   any real sign-in so the two states are mutually exclusive.
 * - `loading` — true until the initial `getSession()` resolves so route
 *   guards can hold off on redirecting before hydration completes.
 */
export function AuthProvider(props: AuthProviderProps) {
  const { children } = props;
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState<boolean>(() => readGuestFlag());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        // Anonymous sessions intentionally keep `guest === true`. Only a
        // real (named-account) sign-in flips guest off.
        if (data.session && !data.session.user.is_anonymous) {
          setGuest(false);
          writeGuestFlag(false);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      // Same rule as above: anonymous sign-in must not clobber the guest
      // flag we set inside `enterGuestMode`.
      if (nextSession && !nextSession.user.is_anonymous) {
        setGuest(false);
        writeGuestFlag(false);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string, keep: boolean): Promise<void> => {
      setKeepSignedIn(keep);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      keep: boolean,
    ): Promise<SignUpOutcome> => {
      setKeepSignedIn(keep);
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
      const signUpOptions: { data: { name: string }; emailRedirectTo?: string } = {
        data: { name },
      };
      if (redirectTo) signUpOptions.emailRedirectTo = redirectTo;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: signUpOptions,
      });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    },
    [],
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    const options: { redirectTo?: string } = {};
    if (redirectTo) options.redirectTo = redirectTo;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options });
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/signin` : undefined;
    const options: { redirectTo?: string } = {};
    if (redirectTo) options.redirectTo = redirectTo;
    const { error } = await supabase.auth.resetPasswordForEmail(email, options);
    if (error) throw error;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setGuest(false);
    writeGuestFlag(false);
  }, []);

  const enterGuestMode = useCallback(async (): Promise<void> => {
    // Provision an anonymous Supabase session so the apiClient has a real
    // Bearer JWT to attach. Without this the localStorage flag would be
    // set but every API call would 401 — silently breaking the no-sign-up
    // "guest" send-to-sign flow. Requires "Anonymous Sign-ins" enabled in
    // the Supabase project (Authentication → Providers → Anonymous); the
    // underlying error is re-surfaced so the caller can toast it.
    //
    // We flip the guest flag *before* the network call so the
    // `onAuthStateChange` listener (which already filters anonymous
    // sessions out of its guest=false branch) has a coherent view if it
    // races us.
    setGuest(true);
    writeGuestFlag(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Roll back so the SPA doesn't lie about a half-broken guest state.
      setGuest(false);
      writeGuestFlag(false);
      throw new Error(
        error.message ||
          'Could not start a guest session. Anonymous sign-ins may be disabled — please sign up instead.',
      );
    }
  }, []);

  const exitGuestMode = useCallback((): void => {
    setGuest(false);
    writeGuestFlag(false);
  }, []);

  const user = useMemo<AuthUser | null>(() => toAuthUser(session?.user), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      guest,
      loading,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      resetPassword,
      signOut,
      enterGuestMode,
      exitGuestMode,
    }),
    [
      session,
      user,
      guest,
      loading,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      resetPassword,
      signOut,
      enterGuestMode,
      exitGuestMode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be called inside <AuthProvider>');
  }
  return value;
}
