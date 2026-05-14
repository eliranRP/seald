import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SignInPage } from './SignInPage';

function renderAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  it('renders the AuthShell with the AuthForm sign-in heading', () => {
    renderAt('/signin');
    // The AuthShell renders multiple level-1 headings (brand panel + form);
    // narrow by accessible name to the sign-in form's welcome heading.
    expect(screen.getByRole('heading', { level: 1, name: /welcome|sign in/i })).toBeInTheDocument();
    // Both the email-password "Sign in" submit and the "Continue with Google"
    // button match — assert on either via getAllBy + length.
    expect(screen.getAllByRole('button', { name: /sign in|continue/i }).length).toBeGreaterThan(0);
  });

  it('surfaces an OAuth error banner when ?error=oauth is present', () => {
    renderAt('/signin?error=oauth');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/google sign-in/i);
  });

  // Audit C: SignIn #1 — the OAuth/guest banner is icon-led so it doesn't
  // look like a plain text strip behind the cookie banner.
  it('renders an AlertTriangle icon inside the OAuth error banner', () => {
    renderAt('/signin?error=oauth');
    const alert = screen.getByRole('alert');
    // lucide-react renders an inline <svg>. We assert by tagName instead
    // of testid so the rule "test by accessible role/name" still applies
    // (the icon itself is decorative — aria-hidden — so role is correct).
    const svg = alert.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});
