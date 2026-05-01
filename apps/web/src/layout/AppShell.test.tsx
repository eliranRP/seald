import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

// AppShell pulls account actions via React-Query — stub the hook so the
// shell can render without a live API. We only care about the legal/
// cookie footer for issue #39 here.
vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

function renderShell() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell legal/cookie footer (issue #39)', () => {
  afterEach(() => {
    delete (window as unknown as { SealdConsent?: unknown }).SealdConsent;
  });

  it('renders the legal trust links beneath the routed content', () => {
    const { getByRole } = renderShell();
    const footer = getByRole('contentinfo', { name: /legal and cookie preferences/i });
    expect(footer).toBeInTheDocument();
    expect(footer.querySelector('a[href="/legal/privacy"]')).toBeInTheDocument();
    expect(footer.querySelector('a[href="/legal/terms"]')).toBeInTheDocument();
    expect(footer.querySelector('a[href="/legal/cookies"]')).toBeInTheDocument();
    expect(footer.querySelector('a[href="/legal/accessibility"]')).toBeInTheDocument();
  });

  it('renders the manage-cookies button next to the trust links', () => {
    const { getByRole } = renderShell();
    const btn = getByRole('button', { name: /manage cookie preferences/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('opens the consent banner when the manage-cookies button is clicked', () => {
    const openBanner = vi.fn();
    (
      window as unknown as { SealdConsent: { openBanner: () => void; getChoice: () => null } }
    ).SealdConsent = { openBanner, getChoice: () => null };
    const { getByRole } = renderShell();
    fireEvent.click(getByRole('button', { name: /manage cookie preferences/i }));
    expect(openBanner).toHaveBeenCalledTimes(1);
  });

  it('no-ops gracefully when the consent runtime has not loaded yet', () => {
    // The cookie-consent script is `defer`-loaded; a click that beats the
    // script must not crash the shell.
    const { getByRole } = renderShell();
    expect(() =>
      fireEvent.click(getByRole('button', { name: /manage cookie preferences/i })),
    ).not.toThrow();
  });
});
