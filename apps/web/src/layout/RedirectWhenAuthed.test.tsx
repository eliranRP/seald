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

  it('bounces a signed-in mobile visitor to /m/send (the dedicated mobile sender) — never the desktop dashboard', () => {
    // Production contract (2026-05-03, refined): the desktop dashboard
    // and the rest of the AppShell-hosted desktop surfaces were not
    // designed for a 390 px viewport (table cells overlap, hero text
    // wraps awkwardly, the title char-stacks). Rather than retrofit
    // responsiveness onto every desktop page, mobile users are locked
    // to the dedicated mobile sender at /m/send. Desktop visitors
    // still see /documents.
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = true;
    renderAt('/signin');
    expect(screen.getByText('mobile send page')).toBeInTheDocument();
  });
});
