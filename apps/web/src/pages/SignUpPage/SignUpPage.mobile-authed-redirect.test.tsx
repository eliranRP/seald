import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignUpPage } from './SignUpPage';

// Production contract (2026-05-03, refined): mirror of SignInPage —
// the desktop dashboard at /documents was not designed for a 390 px
// viewport, so mobile users are locked to the dedicated mobile sender
// at /m/send after sign-up. Desktop users still land on /documents.

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
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/m/send" element={<h1>Mobile sender flow</h1>} />
      </Routes>
    </MemoryRouter>,
    authOverride,
  );
}

async function submitSignUp(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
  // Combined ESIGN attestation (audit C: SignUp #10).
  await user.click(screen.getByLabelText(/legal age and agree/i));
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignUpPage — mobile-aware authed redirect', () => {
  it('lands a desktop user on /documents after immediate-session signup', async () => {
    const user = userEvent.setup();
    mobileViewport = false;
    renderAt({
      auth: { signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })) },
    });
    await submitSignUp(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });

  it('lands a mobile user on /m/send (not /documents) after immediate-session signup', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt({
      auth: { signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })) },
    });
    await submitSignUp(user);
    expect(await screen.findByRole('heading', { name: /mobile sender flow/i })).toBeInTheDocument();
  });
});
