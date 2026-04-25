import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignUpPage } from './SignUpPage';

describe('SignUpPage', () => {
  it('renders the AuthShell with the AuthForm signup heading', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignUpPage />} />
        </Routes>
      </MemoryRouter>,
    );
    // The AuthShell renders multiple level-1 headings (brand panel + form);
    // narrow by accessible name to the signup form's heading.
    expect(
      screen.getByRole('heading', { level: 1, name: /create|sign up|account/i }),
    ).toBeInTheDocument();
    // The signup form exposes a name field — distinguishes it from sign-in.
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});
