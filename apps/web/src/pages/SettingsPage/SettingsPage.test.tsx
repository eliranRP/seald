import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { DevelopersSettingsPage, SettingsIndexPage } from './index';

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsIndexPage />} />
        <Route path="/settings/developers" element={<DevelopersSettingsPage variant="desktop" />} />
        <Route path="/settings/integrations" element={<h1>integrations stub</h1>} />
        <Route path="/m/settings" element={<SettingsIndexPage />} />
        <Route
          path="/m/settings/developers"
          element={<DevelopersSettingsPage variant="mobile" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function flagsOn(on: ReadonlyArray<string>): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation((flag: string) => on.includes(flag));
}

describe('settings pages', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    getMock.mockResolvedValue({ data: { items: [] } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('the index lists the five sections, then Developers when its flag is on', () => {
    flagsOn(['gdriveIntegration', 'mcpServer']);
    renderAt('/settings');

    const list = screen.getByRole('list', { name: 'Settings' });
    expect(list).toBeInTheDocument();
    for (const name of ['Profile', 'Signature', 'Notifications', 'Integrations', 'Account']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        `/settings/${name.toLowerCase()}`,
      );
    }
    expect(screen.getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/settings/developers',
    );
  });

  it('the index hides Integrations when Drive is off and Developers when both API flags are off', () => {
    flagsOn([]);
    renderAt('/settings');

    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Developers' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  });

  it('the index shows Developers when only publicApi is on', () => {
    flagsOn(['publicApi']);
    renderAt('/settings');

    expect(screen.getByRole('link', { name: 'Developers' })).toBeInTheDocument();
  });

  it('the index lists Approvals with the flag on, and links the phone page on a phone', () => {
    flagsOn(['mcpServer']);
    const { unmount } = renderAt('/settings');
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'href',
      '/settings/approvals',
    );
    unmount();

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    renderAt('/m/settings');
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'href',
      '/m/settings/approvals',
    );
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('the index omits Approvals when both developer flags are off', () => {
    flagsOn(['gdriveIntegration']);
    renderAt('/settings');
    expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();
  });

  it('/settings/developers renders the Developers panel with the flag on', async () => {
    flagsOn(['mcpServer']);
    renderAt('/settings/developers');

    expect(screen.getByRole('heading', { name: 'Developers', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New key' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('/m/settings/developers renders the same panel under a phone header', async () => {
    flagsOn(['publicApi']);
    renderAt('/m/settings/developers');

    expect(screen.getByRole('heading', { name: 'Developers', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New key' })).toBeInTheDocument();
  });

  it.each(['/settings/developers', '/m/settings/developers'])(
    '%s is not available, and calls no API, when both flags are off',
    (path) => {
      flagsOn([]);
      renderAt(path);

      expect(screen.getByText('Not available.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New key' })).not.toBeInTheDocument();
      expect(getMock.mock.calls.map((call) => call[0])).not.toContain('/me/api-keys');
    },
  );
});
