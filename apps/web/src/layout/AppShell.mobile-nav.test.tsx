import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

// Production contract (2026-05-03, refined): mobile users are locked to
// the dedicated mobile sender at /m/send. The desktop screens served by
// AppShell (/documents, /templates, /signers, /document/<id>,
// /document/new, /templates/:id/use, /templates/:id/edit) were not
// designed for a 390 px viewport — title char-stacking, table cells
// overlapping, hero text wrapping awkwardly. Rather than retrofit
// responsiveness onto every desktop page, the rule is simpler: any
// authed mobile user that lands inside an AppShell route is bounced to
// /m/send. Desktop visitors render AppShell normally; guests are not in
// this scope (they have their own marketing-style chrome and may need
// to reach /document/new from a mobile browser without an account).

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

let mobileViewport = false;

vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mobileViewport,
  readIsMobileViewport: () => mobileViewport,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

afterEach(() => {
  mobileViewport = false;
});

function renderShellAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<h1>desktop dashboard</h1>} />
          <Route path="/templates" element={<h1>desktop templates</h1>} />
          <Route path="/signers" element={<h1>desktop signers</h1>} />
          <Route path="/document/new" element={<h1>desktop upload</h1>} />
        </Route>
        <Route path="/m/send" element={<h1>mobile sender</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell — mobile-locks-to-msend', () => {
  it('renders the desktop dashboard at /documents on a desktop viewport', () => {
    mobileViewport = false;
    const { getByRole } = renderShellAt('/documents');
    expect(getByRole('heading', { name: /desktop dashboard/i })).toBeInTheDocument();
  });

  it('redirects a mobile authed user from /documents to /m/send', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShellAt('/documents');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
    expect(queryByRole('heading', { name: /desktop dashboard/i })).toBeNull();
  });

  it('redirects a mobile authed user from /templates to /m/send', () => {
    mobileViewport = true;
    const { getByRole } = renderShellAt('/templates');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
  });

  it('redirects a mobile authed user from /signers to /m/send', () => {
    mobileViewport = true;
    const { getByRole } = renderShellAt('/signers');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
  });

  it('redirects a mobile authed user from /document/new to /m/send', () => {
    mobileViewport = true;
    const { getByRole } = renderShellAt('/document/new');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
  });
});
