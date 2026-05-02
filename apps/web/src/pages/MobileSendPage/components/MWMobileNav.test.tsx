import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MWMobileNav } from './MWMobileNav';

// Avoid the real account API endpoints — the hook only ever makes one
// fetch per action, but we don't need to assert that here.
import type * as AccountModule from '@/features/account';
vi.mock('@/features/account', async () => {
  const actual = await vi.importActual<typeof AccountModule>('@/features/account');
  return {
    ...actual,
    useAccountActions: () => ({
      exportData: vi.fn(async () => undefined),
      deleteAccount: vi.fn(async () => undefined),
      isExporting: false,
      isDeleting: false,
      lastError: null,
    }),
  };
});

function renderNav(onSignOut = vi.fn(), initialEntry = '/m/send') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/m/send" element={<MWMobileNav onSignOut={onSignOut} />} />
        <Route path="/documents" element={<div>Documents page</div>} />
        <Route path="/document/new" element={<div>Sign page</div>} />
        <Route path="/templates" element={<div>Templates page</div>} />
        <Route path="/signers" element={<div>Signers page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MWMobileNav', () => {
  it('renders the slim top bar with logo and a hamburger button', () => {
    renderNav();
    expect(screen.getByRole('button', { name: /seald home/i })).toBeInTheDocument();
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the bottom sheet showing the user profile, Documents nav, and Sign out — every other affordance hidden', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: /open menu/i }));

    // Profile chip — name + email from the default test user.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Jamie Okonkwo');
    expect(dialog).toHaveTextContent('jamie@seald.app');

    // 2026-05-03: product decision — the mobile hamburger only exposes
    // Documents (the dashboard) and Sign out. Sign / Templates /
    // Signers / Download my data / Delete account were removed from
    // the sheet because the mobile sender flow lives on `/m/send` and
    // these affordances cluttered the surface without serving a
    // mobile-first task. Anyone needing those reaches them via desktop.
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Templates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signers' })).toBeNull();

    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download my data/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete account/i })).toBeNull();
  });

  it('navigates to Documents and closes the sheet', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: 'Documents' }));
    expect(await screen.findByText('Documents page')).toBeInTheDocument();
  });

  it('triggers onSignOut when the Sign out item is activated', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    renderNav(onSignOut);
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: /^sign out$/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('marks the active Documents item with aria-current="page" when on /documents', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/documents']}>
        <Routes>
          <Route path="/documents" element={<MWMobileNav onSignOut={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const documentsItem = screen.getByRole('button', { name: 'Documents' });
    expect(documentsItem).toHaveAttribute('aria-current', 'page');
  });
});
