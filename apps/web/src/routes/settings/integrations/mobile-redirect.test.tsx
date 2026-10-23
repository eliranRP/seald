import { describe, expect, it, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AppShell } from '../../../layout/AppShell';

// WT-B watchpoint #2, revised for redesign v2: the AppShell no longer
// bounces phones to /m/send. At ≤ 640 px `/settings/integrations` renders
// in place inside the mobile shell, with the bottom nav's "Me" tab lit.

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

  it('renders /settings/integrations in place on a phone with "Me" active', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderAt('/settings/integrations');
    expect(getByRole('heading', { name: /desktop integrations/i })).toBeInTheDocument();
    expect(queryByRole('heading', { name: /mobile sender/i })).toBeNull();
    const nav = getByRole('navigation', { name: 'Main' });
    const active = Array.from(nav.querySelectorAll('a[aria-current="page"]'));
    expect(active.map((a) => a.textContent)).toEqual(['Me']);
  });
});
