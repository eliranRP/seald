import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignUpPage } from './SignUpPage';

// Production bug (2026-05-03): mirror of SignInPage.mobile-authed-redirect —
// after a successful signup that yields an immediate session, the page sent
// mobile users to `/m/send` (the sender flow) instead of `/documents`. Land
// on Documents on every viewport so the user sees their (initially empty)
// dashboard; sending lives within Documents.

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
  await user.click(screen.getByLabelText(/legal age/i));
  await user.click(screen.getByLabelText(/terms of service and privacy policy/i));
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

  it('lands a mobile user on /documents (not /m/send) after immediate-session signup', async () => {
    const user = userEvent.setup();
    mobileViewport = true;
    renderAt({
      auth: { signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })) },
    });
    await submitSignUp(user);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });
});
