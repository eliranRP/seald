import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { seald } from '../../styles/theme';

// Stub Supabase + apiClient before importing the page so the module-level
// initializers don't try to hit the network from jsdom.
vi.mock('../../lib/supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithOAuth: vi.fn(async () => ({ data: null, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: {}, status: 200 })),
  },
}));

// eslint-disable-next-line import/first
import { DebugAuthPage } from './DebugAuthPage';

describe('DebugAuthPage', () => {
  it('renders the Auth debug surface with a Sign-in CTA when signed out', async () => {
    render(
      <ThemeProvider theme={seald}>
        <MemoryRouter>
          <DebugAuthPage />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: /auth debug/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    // The /me button is disabled while no email is set.
    expect(screen.getByRole('button', { name: /call \/me/i })).toBeDisabled();
  });
});
