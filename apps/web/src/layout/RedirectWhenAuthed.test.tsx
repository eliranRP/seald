import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { AuthContextValue } from '../providers/AuthProvider';
import { RedirectWhenAuthed } from './RedirectWhenAuthed';

const baseAuth: AuthContextValue = {
  session: null,
  user: null,
  guest: false,
  loading: false,
  signInWithPassword: vi.fn(async () => undefined),
  signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })),
  signInWithGoogle: vi.fn(async () => undefined),
  resetPassword: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  enterGuestMode: vi.fn(async () => undefined),
  exitGuestMode: vi.fn(),
};

let authState: AuthContextValue = baseAuth;
let mobileViewport = false;

vi.mock('../providers/AuthProvider', () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RedirectWhenAuthed />}>
          <Route path="/signin" element={<div>sign in form</div>} />
        </Route>
        <Route path="/documents" element={<div>desktop dashboard</div>} />
        <Route path="/m/send" element={<div>mobile send page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RedirectWhenAuthed', () => {
  it('renders the inverse-guarded outlet for anonymous users', () => {
    authState = baseAuth;
    mobileViewport = false;
    renderAt('/signin');
    expect(screen.getByText('sign in form')).toBeInTheDocument();
  });

  it('bounces a signed-in desktop visitor to /documents', () => {
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = false;
    renderAt('/signin');
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
  });

  it('bounces a signed-in mobile visitor to /documents (the mobile-responsive dashboard) — never to /m/send', () => {
    // Production bug (2026-05-03): mobile users were sent to /m/send, the
    // sender flow, instead of the Documents dashboard. The dashboard already
    // adapts to mobile, and product wants Documents to be the post-auth
    // landing on every viewport so users see their existing envelopes; the
    // mobile sender now lives inside Documents.
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = true;
    renderAt('/signin');
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
  });
});
