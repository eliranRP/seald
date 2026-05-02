import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ForgotPasswordPage } from './ForgotPasswordPage';

/**
 * `ForgotPasswordPage` is a thin orchestrator over `<AuthForm mode="forgot">`.
 * Validation lives in the form (covered in `AuthForm.test.tsx`); these tests
 * cover what the page itself owns and what was uncovered per the wave-2
 * audit baseline (lines 18 + 25): the post-submit redirect to
 * `/check-email?email=…&mode=reset` and the back-to-sign-in switch.
 */

function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <h1>{location.pathname === '/check-email' ? 'Check your email' : 'Other'}</h1>
      <span data-testid="search">{location.search}</span>
    </div>
  );
}

function renderForgot() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/check-email" element={<LocationProbe />} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
        <Route path="/signup" element={<h1>Sign-up landing</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  it('renders the AuthShell with the forgot-password form heading', () => {
    renderForgot();
    expect(
      screen.getByRole('heading', { level: 1, name: /reset your password|forgot/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /check-email with the email + reset mode after a successful submit', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.fn(async () => undefined);
    renderWithProviders(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/check-email" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
      { auth: { resetPassword } },
    );

    await user.type(screen.getByLabelText(/work email/i), 'jamie@seald.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(resetPassword).toHaveBeenCalledWith('jamie@seald.app');
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    // The page composes the URL with the entered email + a `mode=reset`
    // marker so CheckEmailPage shows the reset-flow copy and resend CTA.
    expect(screen.getByTestId('search').textContent).toBe('?email=jamie%40seald.app&mode=reset');
  });

  it('switches back to sign-in via the footer link', async () => {
    const user = userEvent.setup();
    renderForgot();

    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });
});
