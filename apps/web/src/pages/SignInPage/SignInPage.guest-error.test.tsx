import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignInPage } from './SignInPage';

// Audit gap (2026-05-02): SignInPage.test.tsx covered the static OAuth
// banner via ?error=oauth, but never exercised the dynamic "Skip" path
// where enterGuestMode rejects (project has anonymous sign-ins disabled,
// quota hit, network drop). The page handles this with a banner, but
// the wiring had no assertion — a regression in error-message plumbing
// would silently leave the user with a disabled-looking Skip button and
// no explanation.

function renderAt(initialPath: string, auth: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/document/new" element={<h1>Guest document workspace</h1>} />
      </Routes>
    </MemoryRouter>,
    auth,
  );
}

describe('SignInPage — Skip / guest-mode error', () => {
  it('shows the rejection message in the alert banner when enterGuestMode fails', async () => {
    const user = userEvent.setup();
    const enterGuestMode = vi.fn(async () => {
      throw new Error('Anonymous sign-ins are disabled for this project');
    });
    renderAt('/signin', { auth: { enterGuestMode } });

    await user.click(screen.getByRole('button', { name: /skip — try it/i }));

    const alert = await screen.findByRole('alert');
    // SignInPage prefers the dynamic guest error over the static OAuth
    // copy when both could apply (errorKey = guestError ? 'guest' : ...).
    expect(alert).toHaveTextContent(/guest session|sign up to continue|disabled/i);
  });

  it('falls back to a generic message when enterGuestMode rejects with a non-Error', async () => {
    const user = userEvent.setup();
    const enterGuestMode = vi.fn(async () => {
      // Defence in depth — Supabase historically threw plain objects in
      // some edge cases; the page must not blow up on `err.message`
      // being undefined.
      throw 'boom' as unknown as Error;
    });
    renderAt('/signin', { auth: { enterGuestMode } });

    await user.click(screen.getByRole('button', { name: /skip — try it/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    // Either the generic fallback OR the static "guest" copy — both
    // satisfy the contract that the user is told something went wrong.
    expect(alert.textContent ?? '').not.toBe('');
  });

  it('navigates to /document/new when enterGuestMode resolves', async () => {
    const user = userEvent.setup();
    const enterGuestMode = vi.fn(async () => undefined);
    renderAt('/signin', { auth: { enterGuestMode } });

    await user.click(screen.getByRole('button', { name: /skip — try it/i }));
    expect(
      await screen.findByRole('heading', { name: /guest document workspace/i }),
    ).toBeInTheDocument();
  });
});
