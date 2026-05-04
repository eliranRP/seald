import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';

/**
 * Discoverability gate for /settings/integrations. The Drive integration
 * page exists at AppRoutes.tsx:211–217 but had no nav entry — authed
 * users could only reach it by typing the URL. The
 * `gdrive-feature-manager` skill forbids new top-level NAV_ITEMS, so
 * the avatar dropdown is the canonical entry point. AppShell now passes
 * an `onOpenIntegrations` handler to NavBar/UserMenu when:
 *   - the user is authed (mode === 'authed'), AND
 *   - feature.gdriveIntegration is enabled.
 *
 * `feature.gdriveIntegration` defaults to `true` in
 * `packages/shared/src/feature-flags.ts`, so the dropdown shows the
 * row in production today. These tests pin the contract.
 */
vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

// useIsMobileViewport returns true on tiny viewports — AppShell then short-
// circuits to <Navigate to="/m/send" />, which would skip our dropdown
// entirely. Pin the desktop branch.
vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
  readIsMobileViewport: () => false,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

function renderShellAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
          <Route path="/settings/integrations" element={<h1>integrations page (test stub)</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell — Drive Integrations entry in avatar dropdown', () => {
  it('shows Integrations in the dropdown and navigates to /settings/integrations on click', async () => {
    const { getByRole, findByRole } = renderShellAt('/documents');
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    const integrationsItem = await findByRole('menuitem', { name: /integrations/i });
    await userEvent.click(integrationsItem);
    // The route stub renders an h1 once Navigate completes.
    expect(
      await findByRole('heading', { name: /integrations page \(test stub\)/i }),
    ).toBeInTheDocument();
  });
});
