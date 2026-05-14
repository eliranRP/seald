import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AppShell } from '../../../layout/AppShell';
import { IntegrationsPage } from './IntegrationsPage';

// Slice C audit finding #1 (HIGH): the deployed mobile build shows the
// ErrorBoundary fallback ("Something went wrong") on /settings/integrations
// instead of redirecting to /m/send. The existing mobile-redirect test
// uses a stub <h1>, so it never exercises the real IntegrationsPage
// chunk. This regression test mounts the REAL IntegrationsPage inside the
// real <AppShell /> at viewport 390 px and asserts:
//   (a) the page never crashes the ErrorBoundary on the very first
//       render of the mobile chunk, and
//   (b) the AppShell redirect lands the user on /m/send rather than
//       leaving them parked on the desktop IntegrationsPage chrome.
//
// We use the REAL useIsMobileViewport hook (no vi.mock layer) so the
// test reproduces the same first-render-before-effect timing the audit
// caught in production — matchMedia is stubbed at the window level so
// we control the breakpoint.

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

vi.mock('../../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [], status: 200 }),
    delete: vi.fn(),
  },
}));

vi.mock('../../../lib/observability', () => ({
  reportError: vi.fn(),
  initSentry: vi.fn(),
}));

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(false),
    })),
  });
}

let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // Suppress React's error log when an error boundary catches — without
  // this, the test stack trace gets buried in noise.
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          {/* Mount the real IntegrationsPage (not a stub) so its hooks,
              suspense + lazy scaffolding all run end-to-end. */}
          <Route path="/settings/integrations" element={<IntegrationsPage />} />
        </Route>
        <Route path="/m/send" element={<h1>mobile sender</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IntegrationsPage mobile render (audit slice C #1 — HIGH)', () => {
  it('lands on /m/send (NOT the ErrorBoundary fallback) when mounted at 390 px', async () => {
    installMatchMedia(true);
    renderAt('/settings/integrations');
    // The mobile sender stub renders — proving the redirect fired.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument(),
    );
    // The ErrorBoundary fallback MUST NOT appear; if it does, the
    // page's first render threw before AppShell's mobile-guard could
    // bounce the user.
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    // Neither must the desktop IntegrationsPage chrome — the page MUST
    // NOT have rendered its h1 even briefly (the bug was that the page
    // rendered, crashed the ErrorBoundary, and then the redirect never
    // happened).
    expect(screen.queryByRole('heading', { level: 1, name: /^integrations$/i })).toBeNull();
  });

  it('renders the desktop IntegrationsPage normally on a desktop viewport', async () => {
    installMatchMedia(false);
    renderAt('/settings/integrations');
    expect(
      await screen.findByRole('heading', { level: 1, name: /^integrations$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /mobile sender/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).toBeNull();
  });

  // Defence in depth: even if a future refactor pulls IntegrationsPage
  // out from under AppShell (or the AppShell mobile-guard regresses),
  // the page itself MUST NOT render its desktop chrome on a mobile
  // viewport — at minimum return a `<Navigate to="/m/send">`. Audit
  // slice C #1 (HIGH): a deployed mobile crash whose root cause was
  // exactly this — the page rendered before any mobile guard fired.
  it('does NOT render the desktop chrome when mounted outside AppShell on a mobile viewport', async () => {
    installMatchMedia(true);
    renderWithProviders(
      <MemoryRouter initialEntries={['/settings/integrations']}>
        <Routes>
          <Route path="/settings/integrations" element={<IntegrationsPage />} />
          <Route path="/m/send" element={<h1>mobile sender</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { level: 1, name: /^integrations$/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).toBeNull();
  });
});
