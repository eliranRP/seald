import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

// Redesign v2 contract: mobile users are no longer bounced to /m/send.
// Every AppShell route renders in place on a ≤640px viewport, with the
// NavBar collapsed to the mobile top bar and the bottom MobileNav
// (Documents · Templates · + New · Contacts · Me). Guests and the guided
// approval review render without the bottom nav.

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
          <Route path="/documents" element={<h1>dashboard</h1>} />
          <Route path="/templates" element={<h1>templates</h1>} />
          <Route path="/signers" element={<h1>contacts</h1>} />
          <Route path="/settings" element={<h1>settings</h1>} />
          <Route path="/document/new" element={<h1>upload</h1>} />
          <Route path="/approve/:id/review" element={<h1>approval review</h1>} />
        </Route>
        <Route path="/m/send" element={<h1>mobile sender</h1>} />
      </Routes>
    </MemoryRouter>,
    authMode === 'guest' ? { auth: { user: null, guest: true } } : {},
  );
}

describe('AppShell — mobile shell', () => {
  it.each([
    ['/documents', 'dashboard'],
    ['/templates', 'templates'],
    ['/signers', 'contacts'],
    ['/document/new', 'upload'],
  ])('renders %s in place on a phone (no /m/send redirect)', (path, heading) => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShellAt(path);
    expect(getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(queryByRole('heading', { name: /mobile sender/i })).toBeNull();
  });

  it('shows the bottom nav with Documents active on /documents', () => {
    mobileViewport = true;
    const { getByRole } = renderShellAt('/documents');
    const nav = getByRole('navigation', { name: 'Main' });
    expect(nav).toBeInTheDocument();
    expect(getByRole('link', { name: 'Documents' })).toBeInTheDocument();
    const links = Array.from(nav.querySelectorAll('a'));
    const active = links.filter((a) => a.getAttribute('aria-current') === 'page');
    expect(active.map((a) => a.textContent)).toEqual(['Documents']);
  });

  it('bottom nav tabs navigate and "Me" lands on settings', async () => {
    mobileViewport = true;
    const { getByRole, findByRole } = renderShellAt('/documents');
    const nav = getByRole('navigation', { name: 'Main' });
    const me = Array.from(nav.querySelectorAll('a')).find((a) => a.textContent === 'Me');
    expect(me).toBeDefined();
    if (me) await userEvent.click(me);
    expect(await findByRole('heading', { name: 'settings' })).toBeInTheDocument();
  });

  it('the centre New button opens the new-document flow', async () => {
    mobileViewport = true;
    const { getByRole, findByRole } = renderShellAt('/documents');
    await userEvent.click(getByRole('button', { name: 'New document' }));
    expect(await findByRole('heading', { name: 'upload' })).toBeInTheDocument();
  });

  it('does not render the bottom nav on a desktop viewport', () => {
    mobileViewport = false;
    const { queryByRole } = renderShellAt('/documents');
    expect(queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('does not render the bottom nav for a mobile guest', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShellAt('/document/new', 'guest');
    expect(getByRole('heading', { name: 'upload' })).toBeInTheDocument();
    expect(queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('keeps the guided approval review to itself (no bottom nav)', () => {
    mobileViewport = true;
    const { getByRole, queryByRole } = renderShellAt('/approve/abc/review');
    expect(getByRole('heading', { name: /approval review/i })).toBeInTheDocument();
    expect(queryByRole('navigation', { name: 'Main' })).toBeNull();
  });
});
