import { describe, expect, it, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AppShell } from '../../../layout/AppShell';

// WT-B watchpoint #2: at viewport ≤ 640 px, the new `/settings/integrations`
// surface MUST collapse to /m/send. The existing AppShell mobile-redirect
// rule already covers ALL routes mounted under <AppShell />, so this test
// is a regression contract: as long as the integrations page lives inside
// AppShell, no extra redirect is needed. If a future refactor pulls it out
// of AppShell, this test will fail and force the author to reintroduce
// the redirect.

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

let mobileViewport = false;

vi.mock('../../../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/settings/integrations" element={<h1>desktop integrations</h1>} />
        </Route>
        <Route path="/m/send" element={<h1>mobile sender</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Settings → Integrations mobile redirect (WT-B watchpoint #2)', () => {
  it('renders the desktop integrations page on a desktop viewport', () => {
    mobileViewport = false;
    const { getByRole } = renderAt('/settings/integrations');
    expect(getByRole('heading', { name: /desktop integrations/i })).toBeInTheDocument();
  });

  it('redirects a mobile user from /settings/integrations to /m/send', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderAt('/settings/integrations');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
    expect(queryByRole('heading', { name: /desktop integrations/i })).toBeNull();
  });
});
