import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import type { Session, User } from '@supabase/supabase-js';
import { seald } from '../../styles/theme';

// A minimal session shape — only the user.email field is read by the page.
function makeSession(email: string): Session {
  return {
    access_token: 'tok',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u-1', email } as unknown as User,
  } as unknown as Session;
}

// `vi.hoisted` lets us share mock refs with the (also-hoisted) `vi.mock`
// factories below without tripping the "Cannot access 'X' before
// initialization" guard that fires when factories close over module-scope
// `const`s.
type GetSession = () => Promise<{ data: { session: Session | null } }>;
type OnAuthStateChange = (cb: (event: string, session: Session | null) => void) => {
  data: { subscription: { unsubscribe: () => void } };
};
type SignInWithOAuth = (args: {
  provider: string;
  options: { redirectTo: string };
}) => Promise<{ data: unknown; error: unknown }>;
type SignOut = () => Promise<{ error: unknown }>;
type ApiGet = (
  url: string,
  config?: { signal?: AbortSignal },
) => Promise<{ status: number; data: unknown }>;

const { supabaseAuth, apiGet } = vi.hoisted(() => ({
  supabaseAuth: {
    getSession: vi.fn<GetSession>(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn<OnAuthStateChange>(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithOAuth: vi.fn<SignInWithOAuth>(async () => ({ data: null, error: null })),
    signOut: vi.fn<SignOut>(async () => ({ error: null })),
  },
  apiGet: vi.fn<ApiGet>(async () => ({ status: 200, data: { ok: true } })),
}));

// Stub Supabase + apiClient before importing the page so the module-level
// initializers don't try to hit the network from jsdom.
vi.mock('../../lib/supabase/supabaseClient', () => ({
  supabase: { auth: supabaseAuth },
}));

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: { get: apiGet },
}));

// eslint-disable-next-line import/first
import { DebugAuthPage } from './DebugAuthPage';

function renderPage() {
  return render(
    <ThemeProvider theme={seald}>
      <MemoryRouter>
        <DebugAuthPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DebugAuthPage', () => {
  beforeEach(() => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
    supabaseAuth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    supabaseAuth.signInWithOAuth.mockResolvedValue({ data: null, error: null });
    supabaseAuth.signOut.mockResolvedValue({ error: null });
    apiGet.mockResolvedValue({ data: { ok: true }, status: 200 });
  });

  it('renders the Auth debug surface with a Sign-in CTA when signed out', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /auth debug/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    // The /me button is disabled while no email is set.
    expect(screen.getByRole('button', { name: /call \/me/i })).toBeDisabled();
    expect(screen.getByText(/signed in as: \(none\)/i)).toBeInTheDocument();
  });

  // Audit C: DebugAuthPage #15 — top banner that flags the page as a
  // developer-only diagnostic surface.
  it('renders the developer-only diagnostic banner', async () => {
    renderPage();
    expect(await screen.findByText(/developer-only diagnostic page/i)).toBeInTheDocument();
  });

  it('renders the email + Sign-out CTA when getSession returns a session', async () => {
    supabaseAuth.getSession.mockResolvedValueOnce({
      data: { session: makeSession('jamie@seald.app') },
    });
    renderPage();
    expect(await screen.findByText(/signed in as: jamie@seald\.app/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /call \/me/i })).not.toBeDisabled();
  });

  it('clicking "Sign in with Google" delegates to supabase.auth.signInWithOAuth', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /sign in with google/i }));
    expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const arg = supabaseAuth.signInWithOAuth.mock.calls[0]![0];
    expect(arg.provider).toBe('google');
    expect(arg.options.redirectTo).toMatch(/\/debug\/auth$/);
  });

  it('updates the email banner when onAuthStateChange fires after mount', async () => {
    let capturedCb: ((event: string, session: Session | null) => void) | undefined;
    supabaseAuth.onAuthStateChange.mockImplementationOnce((cb) => {
      capturedCb = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderPage();
    expect(await screen.findByText(/signed in as: \(none\)/i)).toBeInTheDocument();

    act(() => {
      capturedCb!('SIGNED_IN', makeSession('ada@example.com'));
    });
    expect(await screen.findByText(/signed in as: ada@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('clicking "Call /me" hits the API and renders the formatted result', async () => {
    const user = userEvent.setup();
    supabaseAuth.getSession.mockResolvedValueOnce({
      data: { session: makeSession('jamie@seald.app') },
    });
    apiGet.mockResolvedValueOnce({ status: 200, data: { id: 'u-1', email: 'jamie@seald.app' } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /call \/me/i }));

    await waitFor(() => {
      expect(screen.getByText(/200 .*jamie@seald\.app/)).toBeInTheDocument();
    });
    expect(apiGet).toHaveBeenCalledWith(
      '/me',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('renders the error status + message when /me rejects', async () => {
    const user = userEvent.setup();
    supabaseAuth.getSession.mockResolvedValueOnce({
      data: { session: makeSession('jamie@seald.app') },
    });
    const err = Object.assign(new Error('Forbidden'), { status: 403, name: 'Error' });
    apiGet.mockRejectedValueOnce(err);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /call \/me/i }));
    await waitFor(() => {
      expect(screen.getByText(/403 forbidden/i)).toBeInTheDocument();
    });
  });

  it('swallows AbortError / CanceledError without surfacing it to the user', async () => {
    const user = userEvent.setup();
    supabaseAuth.getSession.mockResolvedValueOnce({
      data: { session: makeSession('jamie@seald.app') },
    });
    const aborted = Object.assign(new Error('aborted'), { name: 'CanceledError' });
    apiGet.mockRejectedValueOnce(aborted);
    renderPage();

    const button = await screen.findByRole('button', { name: /call \/me/i });
    await user.click(button);

    // Nothing renders into the result slot; the previous-call abort path is
    // a deliberate no-op so the user sees the original empty state.
    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/aborted/i)).not.toBeInTheDocument();
  });

  it('clicking "Sign out" delegates to supabase.auth.signOut and clears prior /me result', async () => {
    const user = userEvent.setup();
    supabaseAuth.getSession.mockResolvedValueOnce({
      data: { session: makeSession('jamie@seald.app') },
    });
    apiGet.mockResolvedValueOnce({ status: 200, data: { ok: true } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /call \/me/i }));
    await waitFor(() => {
      expect(screen.getByText(/200 /)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(supabaseAuth.signOut).toHaveBeenCalledTimes(1);
    // The page wipes the prior result string after sign-out.
    await waitFor(() => {
      expect(screen.queryByText(/200 /)).not.toBeInTheDocument();
    });
  });
});
