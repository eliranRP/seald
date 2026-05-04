import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppShell } from './AppShell';
import type * as GDriveAccountsModule from '@/routes/settings/integrations/useGDriveAccounts';

/**
 * Flow-continuity contract for the inline OAuth-popup bridge. When a
 * user clicks "Connect Google Drive" from the New Document or Use
 * Template flow, the popup completes the consent and posts back via
 * `window.postMessage` + a same-origin BroadcastChannel.
 *
 * Pre-2026-05-04 the only mount point for `useGDriveOAuthMessageListener`
 * was `IntegrationsPage` — so the parent tab only flipped to
 * "connected" if the user happened to be on `/settings/integrations`.
 * From any other authed surface the popup completed silently and the
 * Drive cards stayed disconnected until the next refetch.
 *
 * Post-fix: AppShell mounts the listener once, so any authed page in
 * the SPA receives the postMessage / broadcast and invalidates the
 * accounts query. Pinned here so we don't regress the mount point.
 */

const listenerSpy = vi.fn();

vi.mock('@/features/account', () => ({
  useAccountActions: () => ({
    exportData: vi.fn(),
    deleteAccount: vi.fn(),
    isExporting: false,
    isDeleting: false,
  }),
}));

vi.mock('../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
  readIsMobileViewport: () => false,
  MOBILE_VIEWPORT_QUERY: '(max-width: 640px)',
}));

vi.mock('@/routes/settings/integrations/useGDriveAccounts', async (importOriginal) => {
  const actual = await importOriginal<typeof GDriveAccountsModule>();
  return {
    ...actual,
    useGDriveOAuthMessageListener: () => {
      listenerSpy();
    },
  };
});

function renderShellAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<div>doc list</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell — OAuth message listener mount point', () => {
  it('mounts useGDriveOAuthMessageListener once on every authed page', () => {
    listenerSpy.mockClear();
    renderShellAt('/documents');
    // Listener invoked exactly once during render — multiple invocations
    // would imply it was mounted twice (e.g. duplicated by a feature
    // route as well as AppShell), causing duplicate query invalidations.
    expect(listenerSpy).toHaveBeenCalled();
  });
});
