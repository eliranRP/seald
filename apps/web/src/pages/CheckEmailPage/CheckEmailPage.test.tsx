import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { CheckEmailPage } from './CheckEmailPage';

function renderAt(
  initialPath: string,
  authOverride: Parameters<typeof renderWithProviders>[1] = {},
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
      </Routes>
    </MemoryRouter>,
    authOverride,
  );
}

describe('CheckEmailPage', () => {
  it('renders the heading + reset-mode body with the user email', () => {
    renderAt('/check-email?email=jamie%40seald.app&mode=reset');
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/jamie@seald\.app/i)).toBeInTheDocument();
    // Reset mode shows a "Resend link" button.
    expect(screen.getByRole('button', { name: /resend link/i })).toBeInTheDocument();
  });

  it('hides the resend button in signup confirmation mode', () => {
    renderAt('/check-email?email=jamie%40seald.app&mode=signup');
    expect(screen.queryByRole('button', { name: /resend link/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
  });

  it('falls back to "your inbox" copy when no email query param is present', () => {
    // The page intentionally tolerates a missing/blank `email` param so it
    // still renders sensible copy if the user lands here directly.
    renderAt('/check-email?mode=reset');
    expect(screen.getByText(/your inbox/i)).toBeInTheDocument();
    // Resend button is rendered but disabled — there's no email to resend to.
    expect(screen.getByRole('button', { name: /resend link/i })).toBeDisabled();
  });

  it('uses the signup copy variant when mode=signup', () => {
    renderAt('/check-email?email=jamie%40seald.app&mode=signup');
    // Distinct from the reset copy ("It'll expire in 30 minutes").
    expect(screen.getByText(/activate your account/i)).toBeInTheDocument();
  });

  it('"Back to sign in" returns the user to /signin', async () => {
    const user = userEvent.setup();
    renderAt('/check-email?email=jamie%40seald.app&mode=reset');
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });

  it('Resend link calls resetPassword and disables the button while in flight', async () => {
    const user = userEvent.setup();
    const deferred: { resolve?: () => void } = {};
    const resetPassword = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    renderAt('/check-email?email=jamie%40seald.app&mode=reset', { auth: { resetPassword } });

    const resend = screen.getByRole('button', { name: /resend link/i });
    await user.click(resend);

    // While the resend promise is pending the button shows the busy label
    // and is disabled — second clicks are blocked by the `resendBusy` guard.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    });
    expect(resetPassword).toHaveBeenCalledWith('jamie@seald.app');
    expect(resetPassword).toHaveBeenCalledTimes(1);

    // A second click while the request is still pending is a no-op.
    await user.click(screen.getByRole('button', { name: /sending/i }));
    expect(resetPassword).toHaveBeenCalledTimes(1);

    // Resolving restores the original label so the user can resend again.
    deferred.resolve?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend link/i })).not.toBeDisabled();
    });
  });

  it('does not call resetPassword when there is no email to resend to', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.fn(async () => undefined);
    renderAt('/check-email?mode=reset', { auth: { resetPassword } });
    // Button is disabled — userEvent.click on a disabled button is a no-op
    // for `pointer-events: none`, but we also assert the spy was never called.
    const resend = screen.getByRole('button', { name: /resend link/i });
    expect(resend).toBeDisabled();
    await user.click(resend);
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
