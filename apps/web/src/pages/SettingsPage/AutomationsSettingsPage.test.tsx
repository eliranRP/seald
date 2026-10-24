import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as shared from 'shared';
import { fakeAutomation } from '@/features/automations/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import {
  AutomationDetailSettingsPage,
  AutomationsSettingsPage,
  NewAutomationSettingsPage,
  SettingsIndexPage,
} from './index';

const ID = '00000000-0000-4000-8000-0000000000a1';

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsIndexPage />} />
        <Route
          path="/settings/automations"
          element={<AutomationsSettingsPage variant="desktop" />}
        />
        <Route
          path="/settings/automations/new"
          element={<NewAutomationSettingsPage variant="desktop" />}
        />
        <Route
          path="/settings/automations/:id"
          element={<AutomationDetailSettingsPage variant="desktop" />}
        />
        <Route path="/settings/integrations" element={<h1>integrations stub</h1>} />
        <Route path="/m/settings" element={<SettingsIndexPage />} />
        <Route
          path="/m/settings/automations"
          element={<AutomationsSettingsPage variant="mobile" />}
        />
        <Route
          path="/m/settings/automations/new"
          element={<NewAutomationSettingsPage variant="mobile" />}
        />
        <Route
          path="/m/settings/automations/:id"
          element={<AutomationDetailSettingsPage variant="mobile" />}
        />
        <Route path="/m/send" element={<h1>send stub</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function flagsOn(on: ReadonlyArray<string>): void {
  vi.spyOn(shared, 'isFeatureEnabled').mockImplementation((flag: string) => on.includes(flag));
}

function serve(): void {
  getMock.mockImplementation((url: string) => {
    if (url === '/automations') {
      return Promise.resolve({ data: { items: [fakeAutomation()], next_cursor: null } });
    }
    if (url.endsWith('/runs')) return Promise.resolve({ data: { items: [], next_cursor: null } });
    return Promise.resolve({ data: fakeAutomation() });
  });
}

describe('automations settings pages', () => {
  beforeEach(() => {
    getMock.mockReset();
    serve();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('/settings has an Automations row only with the flag on', () => {
    flagsOn(['workflowAutomations']);
    const on = renderAt('/settings');
    expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute(
      'href',
      '/settings/automations',
    );
    on.unmount();

    vi.restoreAllMocks();
    flagsOn([]);
    renderAt('/settings');
    expect(screen.queryByRole('link', { name: 'Automations' })).not.toBeInTheDocument();
  });

  it('on a phone the settings index links to the phone page', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    flagsOn(['workflowAutomations']);
    renderAt('/m/settings');
    expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute(
      'href',
      '/m/settings/automations',
    );
  });

  it('/settings/automations lists them inside the settings frame', async () => {
    flagsOn(['workflowAutomations']);
    renderAt('/settings/automations');

    expect(await screen.findByRole('heading', { level: 1, name: 'Automations' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
    expect(await screen.findByRole('switch', { name: 'Send a webhook when sealed' })).toBeChecked();
  });

  it('/m/settings/automations is the phone frame with a Back button, and its links stay on /m', async () => {
    flagsOn(['workflowAutomations']);
    renderAt('/m/settings/automations');

    expect(await screen.findByRole('button', { name: 'Back' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Send a webhook when sealed' })).toHaveAttribute(
      'href',
      `/m/settings/automations/${ID}`,
    );
  });

  it('opens one automation on both widths', async () => {
    flagsOn(['workflowAutomations']);
    const desktop = renderAt(`/settings/automations/${ID}`);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Send a webhook when sealed' }),
    ).toBeVisible();
    desktop.unmount();

    renderAt(`/m/settings/automations/${ID}`);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Send a webhook when sealed' }),
    ).toBeVisible();
  });

  it('/settings/automations/new asks for a recipe', async () => {
    flagsOn(['workflowAutomations']);
    renderAt('/settings/automations/new?recipe=sealed_webhook');
    expect(await screen.findByRole('textbox', { name: 'Webhook address' })).toBeVisible();
  });

  it('with the flag off every page says Not available and makes no API call', () => {
    flagsOn([]);
    for (const path of [
      '/settings/automations',
      '/settings/automations/new?recipe=sealed_webhook',
      `/settings/automations/${ID}`,
      '/m/settings/automations',
    ]) {
      const view = renderAt(path);
      expect(screen.getByRole('status')).toHaveTextContent('Not available.');
      view.unmount();
    }
    // The app shell's own reads are not ours; no /automations call is made.
    expect(getMock.mock.calls.filter(([url]) => String(url).startsWith('/automations'))).toEqual(
      [],
    );
  });
});
