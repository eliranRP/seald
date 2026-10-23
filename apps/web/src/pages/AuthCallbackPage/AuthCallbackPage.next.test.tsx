import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { rememberNext } from '../../layout/nextPath';
import { AuthCallbackPage } from './AuthCallbackPage';

// Google sign-in and the sign-up confirmation email return through
// /auth/callback with no `?next=`. The page that started the round trip parked
// a validated approval path; the callback takes it once.

function renderCallback(search = '') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/approve/:id/review" element={<h1>Approval review</h1>} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthCallbackPage — parked ?next=', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns to the approval review the owner started from', async () => {
    rememberNext('/approve/abc123/review?page=2');
    renderCallback();
    expect(await screen.findByRole('heading', { name: /approval review/i })).toBeInTheDocument();
  });

  it('lands on the dashboard when nothing was parked', async () => {
    renderCallback();
    expect(
      await screen.findByRole('heading', { name: /documents dashboard/i }),
    ).toBeInTheDocument();
  });

  it('lets a provider error win over a parked path', async () => {
    rememberNext('/approve/abc123/review');
    renderCallback('?error=access_denied');
    expect(await screen.findByRole('heading', { name: /sign-in landing/i })).toBeInTheDocument();
  });
});
