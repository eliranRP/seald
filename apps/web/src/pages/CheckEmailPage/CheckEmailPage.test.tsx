import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { CheckEmailPage } from './CheckEmailPage';

function renderAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/check-email" element={<CheckEmailPage />} />
      </Routes>
    </MemoryRouter>,
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
});
