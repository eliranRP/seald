import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AuthCallbackPage } from './AuthCallbackPage';

// Audit gap (2026-05-02): the original AuthCallbackPage.test.tsx only
// asserts that the loading screen renders. The page also owns two
// navigation behaviors that previously had ZERO assertions:
//
//  1. `?error=<anything>` from the OAuth provider → bounce to
//     `/signin?error=oauth` so the sign-in page can surface the failure.
//  2. Once the AuthProvider observes a real session (`!loading && user`)
//     → navigate to `/documents`.
//
// Both are critical to the OAuth flow — a regression here either traps
// the user on a blank loading screen forever (loading=true never
// settled) or silently swallows provider errors (#1 above).

function renderAt(initialPath: string, auth: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
    auth,
  );
}

describe('AuthCallbackPage — provider redirects', () => {
  it('redirects to /signin?error=oauth when the provider returned ?error=...', async () => {
    renderAt('/auth/callback?error=access_denied&error_description=User+denied', {
      auth: { user: null, loading: false },
    });
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });

  it('redirects to /documents once a real session resolves', async () => {
    renderAt('/auth/callback', {
      auth: {
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
        loading: false,
      },
    });
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });

  it('stays on the loading screen while the AuthProvider is still resolving the session', () => {
    renderAt('/auth/callback', { auth: { user: null, loading: true } });
    // No redirect yet — loading screen visible.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign-in|documents/i })).not.toBeInTheDocument();
  });

  // Audit C: AuthCallback #20 — 10-second watchdog so a never-settling
  // Supabase flow doesn't trap users on the loading screen. We fake
  // setTimeout/clearTimeout so the test doesn't sleep 10s wall-clock;
  // `waitFor` uses queueMicrotask + Promise.resolve under the hood, so
  // a hand-cranked polling loop here resolves without competing with
  // the faked timer.
  describe('watchdog (10-second timeout)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('redirects to /signin?error=oauth_timeout when loading does not settle within 10s', async () => {
      renderAt('/auth/callback', { auth: { user: null, loading: true } });
      expect(screen.getByRole('status')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(10_000);
        // Flush any queued microtasks from the navigate() call.
        await Promise.resolve();
      });
      // Synchronous DOM probe — the timer's navigate already committed
      // inside the wrapping act() above, so the new route is visible.
      expect(screen.getByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
    });

    it('clears the watchdog when loading settles before the 10s mark', async () => {
      await act(async () => {
        renderAt('/auth/callback', {
          auth: {
            user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
            loading: false,
          },
        });
        // Flush the useEffect navigation pass.
        await Promise.resolve();
      });
      // Auth-resolved path lands on /documents synchronously.
      expect(screen.getByRole('heading', { name: /documents dashboard/i })).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(20_000);
        await Promise.resolve();
      });
      // Still on /documents — the watchdog never armed because loading
      // was false on first render.
      expect(screen.queryByRole('heading', { name: /sign-in landing/i })).not.toBeInTheDocument();
    });
  });

  it('error redirect wins over the user redirect when both could fire (defence in depth)', async () => {
    // If a provider error AND a hydrated user happened to coincide
    // (e.g. stale session in storage + new OAuth call that errored), the
    // user must end up on /signin so they see the failure rather than
    // being silently dropped on the dashboard.
    renderAt('/auth/callback?error=server_error', {
      auth: {
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
        loading: false,
      },
    });
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });
});
