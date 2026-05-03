import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignInPage } from './SignInPage';

// Production bug (2026-05-03): mobile users completing the password sign-in
// were bounced to `/m/send` (the mobile sender flow) instead of the
// mobile-responsive `/documents` dashboard. Per product, signed-in users —
// regardless of viewport — should land on Documents so they can see their
// existing envelopes; the mobile sender lives under "Send" within Documents.
// Lock the rule in so a future regression that re-introduces the viewport
// branch on `handleAuthed` is caught here, not in production.

let mobileViewport = false;

vi.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderAt(authOverride: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/m/send" element={<h1>Mobile sender flow</h1>} />
      </Routes>
    </MemoryRouter>,
    authOverride,
  );
}

async function submitSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

describe('SignInPage — mobile-aware authed redirect', () => {
  it('lands a desktop user on /documents after successful sign-in', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt({ auth: { signInWithPassword: vi.fn(async () => undefined) } });
    await submitSignIn(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });

  it('lands a mobile user on /documents (not /m/send) after successful sign-in', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt({ auth: { signInWithPassword: vi.fn(async () => undefined) } });
    await submitSignIn(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });
});
