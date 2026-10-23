import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        <Route path="/settings" element={<SettingsIndexPage variant="desktop" />} />
        <Route path="/settings/developers" element={<DevelopersSettingsPage variant="desktop" />} />
        <Route path="/settings/integrations" element={<h1>integrations stub</h1>} />
        <Route path="/m/settings" element={<SettingsIndexPage variant="mobile" />} />
        <Route
          path="/m/settings/developers"
          element={<DevelopersSettingsPage variant="mobile" />}
        />
        <Route path="/m/send/settings" element={<h1>drive stub</h1>} />
        <Route path="/m/send" element={<h1>send stub</h1>} />
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
  });

  it('/settings lists Integrations and Developers when their flags are on', () => {
    flagsOn(['gdriveIntegration', 'mcpServer']);
    renderAt('/settings');

    const list = screen.getByRole('list', { name: 'Settings' });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
    expect(screen.getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/settings/developers',
    );
  });

  it('/settings shows Developers when only publicApi is on, and omits Integrations', () => {
    flagsOn(['publicApi']);
    renderAt('/settings');

    expect(screen.getByRole('link', { name: 'Developers' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('/settings lists Approvals (queue) with the flag on, and the phone link on /m/settings', () => {
    flagsOn(['mcpServer']);
    const { unmount } = renderAt('/settings');
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'href',
      '/settings/approvals',
    );
    unmount();
    renderAt('/m/settings');
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'href',
      '/m/settings/approvals',
    );
  });

  it('/settings omits Approvals when both developer flags are off', () => {
    flagsOn(['gdriveIntegration']);
    renderAt('/settings');
    expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();
  });

  it('/settings omits Developers when both developer flags are off', () => {
    flagsOn(['gdriveIntegration']);
    renderAt('/settings');

    expect(screen.queryByRole('link', { name: 'Developers' })).not.toBeInTheDocument();
  });

  it('/m/settings renders one list with phone links and Drive staying at /m/send/settings', () => {
    flagsOn(['gdriveIntegration', 'mcpServer']);
    renderAt('/m/settings');

    expect(screen.getAllByRole('list', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '/m/send/settings',
    );
    expect(screen.getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/m/settings/developers',
    );
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('/m/settings Back returns to /m/send', async () => {
    const user = userEvent.setup();
    flagsOn(['mcpServer']);
    renderAt('/m/settings');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'send stub' })).toBeInTheDocument();
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
