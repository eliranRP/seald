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

  it('opens the bottom sheet showing the user profile and every nav destination', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: /open menu/i }));

    // Profile chip — name + email from the default test user.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Jamie Okonkwo');
    expect(dialog).toHaveTextContent('jamie@seald.app');

    // Every nav destination is a button with the right accessible name.
    // 2026-05-02: "Signers" was removed from the top nav (the Contacts
    // page is reachable from envelope detail and direct URL); the
    // hamburger must mirror that.
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signers' })).toBeNull();

    // Account actions surface as buttons too.
    expect(screen.getByRole('button', { name: /download my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
  });

  it('navigates to a destination and closes the sheet', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: 'Templates' }));
    expect(await screen.findByText('Templates page')).toBeInTheDocument();
  });

  it('triggers onSignOut when the Sign out item is activated', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    renderNav(onSignOut);
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: /^sign out$/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('marks the active nav item with aria-current="page"', async () => {
    const user = userEvent.setup();
    renderNav(vi.fn(), '/templates');
    // The route is /templates so matchNavId returns 'templates'.
    // But our test routes only render MWMobileNav at /m/send. Render directly:
    renderWithProviders(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<MWMobileNav onSignOut={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );
    // Open the new copy's sheet — there are two open buttons after the
    // double render; click the last (most recently rendered).
    const triggers = screen.getAllByRole('button', { name: /open menu/i });
    const lastTrigger = triggers[triggers.length - 1];
    if (!lastTrigger) throw new Error('expected at least one open-menu trigger');
    await user.click(lastTrigger);
    const templatesItems = screen.getAllByRole('button', { name: 'Templates' });
    const active = templatesItems.find((el) => el.getAttribute('aria-current') === 'page');
    expect(active).toBeDefined();
  });
});
