import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ForgotPasswordPage } from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  it('renders the AuthShell with the forgot-password form heading', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );
    // AuthForm in forgot mode exposes a "Reset your password" or similar
    // accessible heading. Match generously to avoid coupling to copy.
    expect(
      screen.getByRole('heading', { level: 1, name: /reset your password|forgot/i }),
    ).toBeInTheDocument();
  });
});
