import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignUpPage } from './SignUpPage';

/**
 * SignUpPage is a thin orchestrator over `<AuthForm mode="signup">`. It owns
 * four navigation behaviors:
 *  1. Skip → enter guest mode + navigate to `/document/new`
 *  2. Switch mode → navigate via `pathForAuthMode`
 *  3. needsEmailConfirmation → navigate to `/check-email?email=…&mode=signup`
 *  4. authed → navigate to `/documents`
 *
 * The form-validation + consent-gate behavior lives on the shared `AuthForm`
 * (covered by `AuthForm.test.tsx`); these tests cover the wiring that the
 * page itself owns and which previously had zero coverage (lines 20-21, 26,
 * 33, 39 per the wave-2 audit baseline).
 */

function renderSignUp(authOverride: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/document/new" element={<h1>Guest document workspace</h1>} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
        <Route path="/forgot-password" element={<h1>Forgot password landing</h1>} />
        <Route path="/check-email" element={<h1>Check your email</h1>} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
    authOverride,
  );
}

describe('SignUpPage', () => {
  it('renders the AuthShell with the AuthForm signup heading', () => {
    renderSignUp({});
    // The AuthShell renders multiple level-1 headings (brand panel + form);
    // narrow by accessible name to the signup form's heading.
    expect(
      screen.getByRole('heading', { level: 1, name: /create|sign up|account/i }),
    ).toBeInTheDocument();
    // The signup form exposes a name field — distinguishes it from sign-in.
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('skip link enters guest mode and lands on /document/new once consent is given', async () => {
    const user = userEvent.setup();
    const enterGuestMode = vi.fn();
    renderSignUp({ auth: { enterGuestMode } });

    // Consent gates Skip in signup mode (commit 5a3f252) — tick both first so
    // the skip handler actually runs through the page-level navigation.
    await user.click(screen.getByLabelText(/legal age/i));
    await user.click(screen.getByLabelText(/terms of service and privacy policy/i));

    await user.click(screen.getByRole('button', { name: /skip/i }));

    expect(enterGuestMode).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', { name: /guest document workspace/i }),
    ).toBeInTheDocument();
  });

  it('switches to sign-in mode via the footer link', async () => {
    const user = userEvent.setup();
    renderSignUp({});

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });

  it('redirects to /check-email when signup returns needsEmailConfirmation', async () => {
    const user = userEvent.setup();
    const signUpWithPassword = vi.fn(async () => ({ needsEmailConfirmation: true }));
    renderSignUp({ auth: { signUpWithPassword } });

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
    await user.click(screen.getByLabelText(/legal age/i));
    await user.click(screen.getByLabelText(/terms of service and privacy policy/i));

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(signUpWithPassword).toHaveBeenCalledWith(
      'Ada Lovelace',
      'ada@example.com',
      'hunter2hunter',
      true,
    );
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('navigates to /documents when signup yields an immediate session', async () => {
    const user = userEvent.setup();
    const signUpWithPassword = vi.fn(async () => ({ needsEmailConfirmation: false }));
    renderSignUp({ auth: { signUpWithPassword } });

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'hunter2hunter');
    await user.click(screen.getByLabelText(/legal age/i));
    await user.click(screen.getByLabelText(/terms of service and privacy policy/i));

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(signUpWithPassword).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });
});
