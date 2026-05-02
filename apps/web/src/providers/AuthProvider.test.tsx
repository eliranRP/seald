import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

/**
 * Hoisted mock surface for the Supabase auth client. The AuthProvider
 * reads `getSession`, `onAuthStateChange`, `signInAnonymously`, and
 * `signOut`; tests below rebind these per case.
 */
type GetSession = () => Promise<{ data: { session: Session | null } }>;
type AuthStateCb = (event: string, session: Session | null) => void;
type OnAuthStateChange = (cb: AuthStateCb) => {
  data: { subscription: { unsubscribe: () => void } };
};
type SignInAnonymously = () => Promise<{ data: unknown; error: { message: string } | null }>;
type SignOut = () => Promise<{ error: unknown }>;

const { supabaseAuth, listeners } = vi.hoisted(() => {
  const cbs: Array<(event: string, session: Session | null) => void> = [];
  return {
    listeners: cbs,
    supabaseAuth: {
      getSession: vi.fn<GetSession>(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn<OnAuthStateChange>((cb) => {
        cbs.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInAnonymously: vi.fn<SignInAnonymously>(async () => ({ data: null, error: null })),
      signOut: vi.fn<SignOut>(async () => ({ error: null })),
    },
  };
});

vi.mock('../lib/supabase/supabaseClient', () => ({
  supabase: { auth: supabaseAuth },
  setKeepSignedIn: vi.fn(),
}));

// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from './AuthProvider';

function makeAnonSession(): Session {
  return {
    access_token: 'anon-tok',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'anon-1', email: '', is_anonymous: true } as unknown as User,
  } as unknown as Session;
}

function makeNamedSession(email: string): Session {
  return {
    access_token: 'tok',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u-1', email, is_anonymous: false } as unknown as User,
  } as unknown as Session;
}

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    listeners.length = 0;
    supabaseAuth.getSession.mockReset();
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
    supabaseAuth.signInAnonymously.mockReset();
    supabaseAuth.signInAnonymously.mockResolvedValue({ data: null, error: null });
    supabaseAuth.signOut.mockReset();
    supabaseAuth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('enterGuestMode provisions an anonymous Supabase session and sets guest=true', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enterGuestMode();
    });

    expect(supabaseAuth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(result.current.guest).toBe(true);
    expect(window.localStorage.getItem('sealed.guest')).toBe('1');
  });

  it('enterGuestMode rolls back guest flag when signInAnonymously fails', async () => {
    supabaseAuth.signInAnonymously.mockResolvedValueOnce({
      data: null,
      error: { message: 'anonymous sign-ins disabled' },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.enterGuestMode();
      }),
    ).rejects.toThrow(/anonymous sign-ins disabled/i);

    expect(result.current.guest).toBe(false);
    expect(window.localStorage.getItem('sealed.guest')).toBe(null);
  });

  it('onAuthStateChange with an anonymous session does NOT clobber guest=true', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enterGuestMode();
    });
    expect(result.current.guest).toBe(true);

    // Race the listener — anonymous session should not flip guest off.
    act(() => {
      for (const cb of listeners) cb('SIGNED_IN', makeAnonSession());
    });
    expect(result.current.guest).toBe(true);
  });

  it('onAuthStateChange with a NAMED session clears the guest flag', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enterGuestMode();
    });
    expect(result.current.guest).toBe(true);

    act(() => {
      for (const cb of listeners) cb('SIGNED_IN', makeNamedSession('ada@example.com'));
    });
    expect(result.current.guest).toBe(false);
    expect(window.localStorage.getItem('sealed.guest')).toBe(null);
  });

  it('hydration re-issues an anonymous session when sealed.guest=1 but getSession returns null', async () => {
    // Reproduces the production failure mode behind the user-reported
    // "send not sent" bug: the SPA boots with the guest flag still in
    // localStorage (e.g. left over from a prior session whose access
    // token has since expired) but `getSession()` resolves to null. The
    // apiClient would attach no Bearer token and every API call would
    // 401. The fix mints a fresh anonymous session on hydration so the
    // guest flow works without forcing the user back through the
    // signup → Skip flow.
    window.localStorage.setItem('sealed.guest', '1');
    supabaseAuth.getSession.mockResolvedValueOnce({ data: { session: null } });
    supabaseAuth.signInAnonymously.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseAuth.signInAnonymously).toHaveBeenCalledTimes(1);
    // Flag stays set — the listener will pick up the new anon session.
    expect(window.localStorage.getItem('sealed.guest')).toBe('1');
    expect(result.current.guest).toBe(true);
  });

  it('hydration drops the guest flag if signInAnonymously fails on rehydrate', async () => {
    // Defence in depth: when the Supabase project disables anonymous
    // sign-ins, the rehydrate attempt returns an error. We must not
    // leave the SPA in "acts like guest, has no JWT" purgatory — drop
    // the flag so RequireAuthOrGuest will redirect to /signin instead.
    window.localStorage.setItem('sealed.guest', '1');
    supabaseAuth.getSession.mockResolvedValueOnce({ data: { session: null } });
    supabaseAuth.signInAnonymously.mockResolvedValueOnce({
      data: null,
      error: { message: 'Anonymous sign-ins are disabled' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseAuth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('sealed.guest')).toBe(null);
    expect(result.current.guest).toBe(false);
  });

  it('hydration does NOT call signInAnonymously when an existing session is present', async () => {
    // Healthy case: the persisted refresh token already produced an
    // access token. We must not waste a round-trip minting a new anon
    // session on top.
    window.localStorage.setItem('sealed.guest', '1');
    supabaseAuth.getSession.mockResolvedValueOnce({ data: { session: makeAnonSession() } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseAuth.signInAnonymously).not.toHaveBeenCalled();
    expect(result.current.guest).toBe(true);
  });

  it('renders children without throwing', () => {
    const view = render(
      <AuthProvider>
        <div>hello</div>
      </AuthProvider>,
    );
    expect(view.getByText('hello')).toBeInTheDocument();
  });
});
