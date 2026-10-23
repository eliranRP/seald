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
  signInWithEmailLink: vi.fn(async () => undefined),
  completeProfile: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn(async () => undefined),
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
        <Route path="/welcome" element={<div>welcome step</div>} />
        <Route path="/documents" element={<div>desktop dashboard</div>} />
        <Route path="/m/send" element={<div>mobile send page</div>} />
        <Route path="/approve/:id/review" element={<div>approval review</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const SIGNED_IN = {
  ...baseAuth,
  user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
};

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

  it('sends a brand-new account (no profile name yet) to /welcome first', () => {
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'a' },
      session: {
        user: {
          id: 'u1',
          is_anonymous: false,
          user_metadata: {},
          created_at: '2026-05-01T00:00:00Z',
        },
      } as unknown as AuthContextValue['session'],
    };
    mobileViewport = false;
    renderAt('/signin');
    expect(screen.getByText('welcome step')).toBeInTheDocument();
  });

  it('bounces a signed-in mobile visitor to /documents as well (no /m/send lock in v2)', () => {
    // Redesign v2: the AppShell screens are responsive, so a phone lands
    // on the same dashboard as desktop.
    authState = {
      ...baseAuth,
      user: { id: 'u1', email: 'a@b.co', name: 'Alex' },
    };
    mobileViewport = true;
    renderAt('/signin');
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
    expect(screen.queryByText('mobile send page')).toBeNull();
  });

  it('returns a signed-in mobile visitor to a validated ?next= approval review', () => {
    authState = SIGNED_IN;
    mobileViewport = true;
    renderAt('/signin?next=%2Fapprove%2Fabc%2Freview%3Fpage%3D1');
    expect(screen.getByText('approval review')).toBeInTheDocument();
  });

  it('returns a signed-in desktop visitor to a validated ?next= approval review', () => {
    authState = SIGNED_IN;
    mobileViewport = false;
    renderAt('/signin?next=%2Fapprove%2Fabc%2Freview');
    expect(screen.getByText('approval review')).toBeInTheDocument();
  });

  it.each([
    ['protocol-relative', '%2F%2Fevil.com'],
    ['absolute URL', 'https%3A%2F%2Fevil.com'],
    ['backslash', '%2F%5Cevil.com'],
    ['in-app path outside the allow-list', '%2Fm%2Fsend'],
    ['double-encoded', '%252F%252Fevil.com'],
  ])('ignores an unsafe ?next= (%s) and falls back to the default', (_label, encoded) => {
    authState = SIGNED_IN;
    mobileViewport = true;
    const { unmount } = renderAt(`/signin?next=${encoded}`);
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
    unmount();

    mobileViewport = false;
    renderAt(`/signin?next=${encoded}`);
    expect(screen.getByText('desktop dashboard')).toBeInTheDocument();
  });
});
