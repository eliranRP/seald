import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { FeatureFlag } from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    // Only the connected-apps call is under test; app-state reads get an empty answer.
    get: (url: string, ...rest: unknown[]): unknown =>
      url === '/me/connected-apps' ? getMock(url, ...rest) : Promise.resolve({ data: [] }),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { ConnectedApps } from './ConnectedApps';
import { fakeConnectedApp } from './fixtures';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

describe('ConnectedApps', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
  });
  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing and calls nothing while OAuth is dark', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: false };
    renderWithProviders(<ConnectedApps />);
    expect(screen.queryByRole('heading', { name: 'Connected apps' })).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the API says the feature is not there (404)', async () => {
    getMock.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    renderWithProviders(<ConnectedApps />);
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/me/connected-apps');
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Connected apps' })).not.toBeInTheDocument();
    });
  });

  it('shows the empty state until an app is connected', async () => {
    getMock.mockResolvedValue({ data: { items: [] } });
    renderWithProviders(<ConnectedApps />);
    expect(await screen.findByText(/No connected apps/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connected apps' })).toBeInTheDocument();
  });

  it('lists apps with host, unverified label and access', async () => {
    getMock.mockResolvedValue({
      data: {
        items: [
          fakeConnectedApp(),
          fakeConnectedApp({
            id: '00000000-0000-4000-8000-0000000000c2',
            client_name: 'Agent',
            client_host: 'agent.example.org',
            unverified: true,
            scopes: ['envelopes:read'],
          }),
        ],
      },
    });
    const { container } = renderWithProviders(<ConnectedApps />);
    const list = await screen.findByRole('list', { name: 'Connected apps' });
    expect(within(list).getByText('Claude')).toBeInTheDocument();
    expect(within(list).getByText('Agent')).toBeInTheDocument();
    expect(within(list).getByText('claude.example')).toBeInTheDocument();
    expect(within(list).getByText('Unverified')).toBeInTheDocument();
    const access = screen.getByRole('list', { name: 'Claude access' });
    expect(within(access).getByText('Send and remind')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('revoke asks once with focus on Cancel, then revokes', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ data: { items: [fakeConnectedApp()] } });
    postMock.mockResolvedValue({ data: { revoked: true } });
    renderWithProviders(<ConnectedApps />);

    await user.click(await screen.findByRole('button', { name: 'Revoke Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Claude?' });
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(postMock).toHaveBeenCalledWith(
      '/me/connected-apps/00000000-0000-4000-8000-0000000000c1/revoke',
    );
  });

  it('Cancel keeps the app', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ data: { items: [fakeConnectedApp()] } });
    renderWithProviders(<ConnectedApps />);
    await user.click(await screen.findByRole('button', { name: 'Revoke Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Claude?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(postMock).not.toHaveBeenCalled();
  });

  it('says so when revoke fails', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ data: { items: [fakeConnectedApp()] } });
    postMock.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ConnectedApps />);
    await user.click(await screen.findByRole('button', { name: 'Revoke Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Claude?' });
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't revoke the app");
  });
});
