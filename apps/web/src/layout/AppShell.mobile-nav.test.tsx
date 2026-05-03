import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

// Production contract (2026-05-03, refined a second time per user
// feedback): mobile users are locked to the dedicated mobile sender at
// /m/send — REGARDLESS of auth state. The desktop screens served by
// AppShell (/documents, /templates, /signers, /document/<id>,
// /document/new, /templates/:id/use, /templates/:id/edit) were not
// designed for a 390 px viewport — title char-stacking, table cells
// overlapping, hero text wrapping awkwardly. Rather than retrofit
// responsiveness onto every desktop page, the rule is simpler: any
// mobile user that lands inside an AppShell route is bounced to
// /m/send. The mobile sender supports guest sessions on its own
// (mirrors the desktop guest flow at /document/new), so unauthed
// visitors land on the mobile screens we built rather than the desktop
// chrome that doesn't fit. Desktop visitors render AppShell normally.

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

function renderShellAt(path: string, authMode: 'authed' | 'guest' = 'authed') {
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
    authMode === 'guest' ? { auth: { user: null, guest: true } } : {},
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

  it('redirects a mobile GUEST user from /document/new to /m/send', () => {
    // Guests are unauthenticated visitors who chose "Skip" on the auth
    // CTAs and want to draft a document without an account. The desktop
    // path is /document/new; on a phone viewport we send them to the
    // mobile sender at /m/send instead, which handles guest sessions
    // identically to the desktop UploadRoute.
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShellAt('/document/new', 'guest');
    expect(getByRole('heading', { name: /mobile sender/i })).toBeInTheDocument();
    expect(queryByRole('heading', { name: /desktop upload/i })).toBeNull();
  });

  it('keeps the desktop dashboard visible to a desktop GUEST visitor', () => {
    // Desktop guests still see the desktop chrome — the chrome itself is
    // sized for ≥1024 px viewports and the marketing-style auth CTAs in
    // the NavBar render fine on a laptop.
    mobileViewport = false;
    const { getByRole } = renderShellAt('/documents', 'guest');
    expect(getByRole('heading', { name: /desktop dashboard/i })).toBeInTheDocument();
  });
});
