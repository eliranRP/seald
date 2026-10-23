import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { CheckEmailPage } from './CheckEmailPage';

function renderAt(entry: string, auth: Partial<AuthContextValue> = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth },
  );
}

describe('CheckEmailPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces the link was sent to the address in the query', () => {
    renderAt('/check-email?email=alice%40example.com');
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    const status = screen.getByRole('status', { name: /sign-in link sent/i });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('alice@example.com');
  });

  it('goes back to /signin when there is no email to check', async () => {
    renderAt('/check-email');
    expect(await screen.findByRole('heading', { name: 'Sign-in landing' })).toBeInTheDocument();
  });

  it('"Use a different email" returns to /signin', async () => {
    renderAt('/check-email?email=alice%40example.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    });
    expect(await screen.findByRole('heading', { name: 'Sign-in landing' })).toBeInTheDocument();
  });

  it('resends through the magic-link call once the cooldown is over', async () => {
    vi.useFakeTimers();
    const signInWithEmailLink = vi.fn(async (_email: string) => undefined);
    renderAt('/check-email?email=alice%40example.com', { signInWithEmailLink });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    });
    expect(signInWithEmailLink).toHaveBeenCalledWith('alice@example.com');
  });
});
