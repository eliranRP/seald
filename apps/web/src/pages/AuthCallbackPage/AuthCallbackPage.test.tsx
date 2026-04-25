import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AuthCallbackPage } from './AuthCallbackPage';

describe('AuthCallbackPage', () => {
  it('renders the loading screen while the AuthProvider resolves the session', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
      // Force the loading state — user undefined, loading true.
      { auth: { user: null, loading: true } },
    );
    // AuthLoadingScreen exposes a status role with "Signing you in" copy.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
