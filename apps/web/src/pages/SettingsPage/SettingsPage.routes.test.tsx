import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { DEFAULT_USER_SETTINGS } from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...a: unknown[]): unknown => getMock(...a),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { SettingsPage, SettingsRoot } from './index';

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsRoot />} />
        <Route path="/settings/developers" element={<h1>developers stub</h1>} />
        <Route path="/settings/:section" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function phone(on: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('SettingsPage routes', () => {
  beforeEach(() => {
    getMock
      .mockReset()
      .mockImplementation((url: string) =>
        Promise.resolve({ data: url === '/me/settings' ? DEFAULT_USER_SETTINGS : [] }),
      );
    phone(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('/settings opens Profile on desktop', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('region', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('shows a nav with five sections and marks the current one', async () => {
    renderAt('/settings/notifications');
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    for (const name of ['Profile', 'Signature', 'Notifications', 'Integrations', 'Account']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  it.each([
    ['signature', 'Signature'],
    ['integrations', 'Integrations'],
    ['account', 'Account'],
  ])('/settings/%s renders its section', async (id, name) => {
    renderAt(`/settings/${id}`);
    expect(await screen.findByRole('region', { name })).toBeInTheDocument();
  });

  it('an unknown section falls back to Profile', async () => {
    renderAt('/settings/nope');
    expect(await screen.findByRole('region', { name: 'Profile' })).toBeInTheDocument();
  });

  it('hides Integrations, and sends its URL to Profile, when Drive is off', async () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockReturnValue(false);
    renderAt('/settings/integrations');
    expect(await screen.findByRole('region', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('keeps flagged pages reachable from the nav', async () => {
    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'mcpServer' || flag === 'gdriveIntegration',
    );
    renderAt('/settings/profile');
    expect(screen.getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/settings/developers',
    );
  });

  it('on a phone /settings is the section index, and a section has a Back arrow to it', async () => {
    phone(true);
    const first = renderAt('/settings');
    expect(await screen.findByRole('list', { name: 'Settings' })).toBeInTheDocument();
    first.unmount();

    renderAt('/settings/signature');
    expect(screen.getByRole('link', { name: 'Back to settings', hidden: true })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
