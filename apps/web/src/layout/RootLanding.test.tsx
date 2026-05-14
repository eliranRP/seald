import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { AuthContextValue } from '../providers/AuthProvider';
import { RootLanding } from './RootLanding';

const baseAuth: AuthContextValue = {
  session: null,
  user: null,
  guest: false,
  loading: false,
  signInWithPassword: vi.fn(async () => undefined),
  signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })),
  signInWithGoogle: vi.fn(async () => undefined),
  resetPassword: vi.fn(async () => undefined),
  resendSignUpConfirmation: vi.fn(async () => undefined),
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
        <Route path="/" element={<RootLanding />} />
        <Route path="/documents" element={<div>desktop dashboard</div>} />
        <Route path="/m/send" element={<div>mobile send page</div>} />
        <Route path="/document/new" element={<div>guest upload</div>} />
        <Route path="/signin" element={<div>sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RootLanding', () => {
  it('routes a signed-in desktop user to /documents', () => {
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = false;
    renderAt('/');
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
  });

  it('routes a signed-in mobile user to /m/send', () => {
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = true;
    renderAt('/');
    expect(screen.getByText('mobile send page')).toBeInTheDocument();
  });

  it('routes a guest mobile user to /m/send too', () => {
    authState = { ...baseAuth, guest: true };
    mobileViewport = true;
    renderAt('/');
    expect(screen.getByText('mobile send page')).toBeInTheDocument();
  });

  it('routes a guest desktop user to /document/new', () => {
    authState = { ...baseAuth, guest: true };
    mobileViewport = false;
    renderAt('/');
    expect(screen.getByText('guest upload')).toBeInTheDocument();
  });

  it('sends an anonymous user to /signin regardless of viewport', () => {
    authState = baseAuth;
    mobileViewport = true;
    renderAt('/');
    expect(screen.getByText('sign in')).toBeInTheDocument();
  });
});
