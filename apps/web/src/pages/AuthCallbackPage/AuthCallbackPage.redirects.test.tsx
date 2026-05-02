import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
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
