import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as AuthProviderModule from '../../providers/AuthProvider';

// Bug G (Phase 6.A iter-2 PROD, 2026-05-04). The OAuth-callback popup
// is opened at 480 × 720 px. Mounting `/oauth/gdrive/callback` INSIDE
// AppShell would re-trigger the mobile-redirect (≤ 640 px → /m/send)
// and the popup would never close. This test pins the routing contract:
// at a mobile viewport, hitting `/oauth/gdrive/callback` MUST render
// the GDriveOAuthCallbackPage (no /m/send redirect).

vi.mock('../../routes/settings/integrations/IntegrationsPage', () => ({
  IntegrationsPage: () => <h1>integrations stub</h1>,
}));

let mobileViewport = true;
vi.mock('../../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

vi.mock('../../providers/AuthProvider', async () => {
  const actual = await vi.importActual<typeof AuthProviderModule>('../../providers/AuthProvider');
  return {
    ...actual,
    useAuth: () => ({
      session: { access_token: 'x' },
      user: { id: 'u1', email: 'e@example.com', name: 'E' },
      guest: false,
      loading: false,
      signInWithPassword: vi.fn(),
      signUpWithPassword: vi.fn(),
      signInWithGoogle: vi.fn(),
      resetPassword: vi.fn(),
      resendSignUpConfirmation: vi.fn(),
      signOut: vi.fn(),
      enterGuestMode: vi.fn(),
      exitGuestMode: vi.fn(),
    }),
  };
});

import { renderWithProviders } from '../../test/renderWithProviders';
import { AppRoutes } from '../../AppRoutes';

describe('AppRoutes /oauth/gdrive/callback (Bug G — bypass mobile redirect)', () => {
  beforeEach(() => {
    mobileViewport = true;
    // Popup mode: opener is set, so the bridge renders the "Drive
    // connected" surface (and would postMessage + close — both no-ops
    // on window mocks below). The marker text is the proof we did NOT
    // mobile-redirect to /m/send.
    Object.defineProperty(window, 'opener', {
      value: { postMessage: vi.fn() } as unknown as Window,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'close', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  it('renders the bridge page at mobile viewport (route is OUTSIDE AppShell)', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/oauth/gdrive/callback?connected=1']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // Pin: the bridge surface renders. If the route were inside AppShell,
    // the mobile-viewport guard would have replaced this with the
    // MobileSendPage at /m/send and the marker text below would be absent.
    expect(await screen.findByText(/drive connected|connecting drive/i)).toBeInTheDocument();
  });
});
