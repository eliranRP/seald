import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignUpPage } from './SignUpPage';

// Audit gap (2026-05-03): mirror of SignInPage.mobile-redirect — the
// SignUp page also hardcoded the post-skip destination, dropping mobile
// guests onto the desktop guest workspace instead of /m/send.

let mobileViewport = false;

vi.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderAt() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/document/new" element={<h1>Guest document workspace</h1>} />
        <Route path="/m/send" element={<h1>Mobile sender flow</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth: { user: null, enterGuestMode: vi.fn(async () => undefined) } },
  );
}

// Signup gates Skip behind ESIGN affirmative consent (T-24/T-25): the user
// must tick the combined attestation before the Skip button enables.
// Encapsulated here so the assertion is self-contained.
async function tickSignupConsents(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/legal age and agree/i));
}

describe('SignUpPage — mobile-aware Skip routing', () => {
  it('routes the guest skip path to /document/new on desktop', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt();
    await tickSignupConsents(user);
    await user.click(screen.getByRole('button', { name: /skip — try it/i }));
    expect(
      await screen.findByRole('heading', { name: /guest document workspace/i }),
    ).toBeInTheDocument();
  });

  it('routes the guest skip path to /m/send on mobile', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt();
    await tickSignupConsents(user);
    await user.click(screen.getByRole('button', { name: /skip — try it/i }));
    expect(await screen.findByRole('heading', { name: /mobile sender flow/i })).toBeInTheDocument();
  });
});
