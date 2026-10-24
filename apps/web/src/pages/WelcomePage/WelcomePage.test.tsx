import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { renderWithProviders } from '@/test/renderWithProviders';
import { rememberNext } from '@/layout/nextPath';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { WelcomePage } from './WelcomePage';

function sessionFor(metadata: Record<string, unknown>): Session {
  return {
    access_token: 't',
    user: {
      id: 'u1',
      is_anonymous: false,
      user_metadata: metadata,
      created_at: '2026-05-01T10:00:00Z',
      last_sign_in_at: '2026-05-01T10:00:00Z',
    },
  } as unknown as Session;
}

const USER = { id: 'u1', email: 'hannah@quill.vc', name: 'hannah' };

function renderWelcome(auth: Partial<AuthContextValue>) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/welcome']}>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/signin" element={<h1>Sign-in landing</h1>} />
        <Route path="/documents" element={<h1>Documents dashboard</h1>} />
        <Route path="/approve/:id/review" element={<h1>Approval review</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth },
  );
}

describe('WelcomePage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('sends a signed-out visitor to /signin', async () => {
    renderWelcome({ user: null, session: null });
    expect(await screen.findByRole('heading', { name: 'Sign-in landing' })).toBeInTheDocument();
  });

  it('shows the name + terms step for a new account', () => {
    renderWelcome({ user: USER, session: sessionFor({}) });
    expect(screen.getByRole('heading', { name: 'Welcome to Seald' })).toBeInTheDocument();
    expect(screen.getByText('hannah@quill.vc')).toBeInTheDocument();
  });

  it('pre-fills the Google profile name', () => {
    renderWelcome({ user: USER, session: sessionFor({ name: 'Hannah Wills' }) });
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue('Hannah Wills');
  });

  it('saves the profile with the typed name', async () => {
    const user = userEvent.setup();
    const completeProfile = vi.fn(async (_name: string) => undefined);
    renderWelcome({ user: USER, session: sessionFor({}), completeProfile });
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Hannah Wills');
    await user.click(screen.getByRole('checkbox', { name: /agree to the terms/i }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(completeProfile).toHaveBeenCalledWith('Hannah Wills');
  });

  it('continues to /documents when the profile is already complete', async () => {
    renderWelcome({
      user: USER,
      session: sessionFor({ full_name: 'Hannah Wills', terms_accepted_at: '2026-05-01T10:01:00Z' }),
    });
    expect(await screen.findByRole('heading', { name: 'Documents dashboard' })).toBeInTheDocument();
  });

  it('continues to the parked ?next= when the profile is complete', async () => {
    rememberNext('/approve/abc/review');
    renderWelcome({
      user: USER,
      session: sessionFor({ full_name: 'Hannah Wills', terms_accepted_at: '2026-05-01T10:01:00Z' }),
    });
    expect(await screen.findByRole('heading', { name: 'Approval review' })).toBeInTheDocument();
  });
});
