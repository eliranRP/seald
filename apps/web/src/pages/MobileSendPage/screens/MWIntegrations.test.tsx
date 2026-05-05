import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as flagsModule from 'shared';

const disconnectMutateMock = vi.fn();

vi.mock('@/routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: vi.fn() }),
  useDisconnectGDrive: () => ({
    mutate: disconnectMutateMock,
    isPending: false,
    error: null,
  }),
  useGDriveOAuthMessageListener: vi.fn(),
}));

import * as gdriveAccountsHook from '@/routes/settings/integrations/useGDriveAccounts';
import { MWIntegrations } from './MWIntegrations';

function renderIntegrations(initialEntries: string[] = ['/m/send/settings']) {
  return renderWithProviders(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/m/send/settings" element={<MWIntegrations />} />
        <Route path="/m/send" element={<div>Mobile Send Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MWIntegrations', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);

  beforeEach(() => {
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    isFeatureEnabledSpy.mockReturnValue(true);
    useGDriveAccountsMock.mockReset();
  });

  afterEach(() => {
    isFeatureEnabledSpy.mockRestore();
    disconnectMutateMock.mockReset();
  });

  it('renders "Connect Google Drive" button when no account is connected', () => {
    useGDriveAccountsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);

    renderIntegrations();

    expect(screen.getByRole('button', { name: /connect google drive/i })).toBeInTheDocument();
    expect(screen.getByText(/connect your google drive/i)).toBeInTheDocument();
  });

  it('renders connected account email and disconnect button', () => {
    useGDriveAccountsMock.mockReturnValue({
      data: [
        {
          id: 'acc-1',
          email: 'test@example.com',
          connectedAt: '2026-05-01T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);

    renderIntegrations();

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('shows disconnect modal when disconnect is clicked', async () => {
    const user = userEvent.setup();
    useGDriveAccountsMock.mockReturnValue({
      data: [
        {
          id: 'acc-1',
          email: 'test@example.com',
          connectedAt: '2026-05-01T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);

    renderIntegrations();

    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThanOrEqual(2);
  });

  it('does not render the Google Drive card when feature flag is off', () => {
    isFeatureEnabledSpy.mockReturnValue(false);
    useGDriveAccountsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);

    renderIntegrations();

    expect(screen.getByText('No integrations available.')).toBeInTheDocument();
    expect(screen.queryByText('Google Drive')).not.toBeInTheDocument();
  });

  it('shows success toast when connected=1 query param is present', () => {
    useGDriveAccountsMock.mockReturnValue({
      data: [
        {
          id: 'acc-1',
          email: 'new@example.com',
          connectedAt: '2026-05-05T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);

    renderIntegrations(['/m/send/settings?connected=1']);

    expect(screen.getByText(/google drive connected successfully/i)).toBeInTheDocument();
  });
});
