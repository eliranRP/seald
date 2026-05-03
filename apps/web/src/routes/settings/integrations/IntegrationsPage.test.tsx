import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { IntegrationsPage } from './IntegrationsPage';

vi.mock('../../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

const openSpy = vi.fn();
Object.defineProperty(window, 'open', { value: openSpy, writable: true });

import { apiClient } from '../../../lib/api/apiClient';
const mockedGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockedDelete = apiClient.delete as ReturnType<typeof vi.fn>;

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/settings/integrations']}>
      <IntegrationsPage />
    </MemoryRouter>,
  );
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSpy.mockReset();
  });

  it('renders the breadcrumb + page title (no SettingsLayout / left rail)', async () => {
    mockedGet.mockResolvedValueOnce({ data: [], status: 200 });
    renderPage();
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /integrations/i })).toBeInTheDocument();
    // Sanity: the marketing-style "left settings rail" must NOT exist.
    expect(screen.queryByRole('navigation', { name: /settings rail/i })).toBeNull();
  });

  it('shows a Connect Google Drive CTA when no accounts are connected', async () => {
    mockedGet.mockResolvedValueOnce({ data: [], status: 200 });
    renderPage();
    const button = await screen.findByRole('button', { name: /connect google drive/i });
    expect(button).toBeInTheDocument();
  });

  it('opens the Google consent URL when the user clicks Connect', async () => {
    // URL-aware mock so the order of GETs (accounts list vs OAuth URL)
    // doesn't matter — React-Query may refetch the accounts list any time
    // it perceives the cache as stale, so a strict mockResolvedValueOnce
    // chain is brittle here.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/integrations/gdrive/accounts') {
        return Promise.resolve({ data: [], status: 200 });
      }
      if (url === '/integrations/gdrive/oauth/url') {
        return Promise.resolve({
          data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?fake=1' },
          status: 200,
        });
      }
      return Promise.resolve({ data: {}, status: 200 });
    });
    renderPage();
    const button = await screen.findByRole('button', { name: /connect google drive/i });
    await userEvent.click(button);
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?fake=1',
        'gdrive-oauth',
        expect.any(String),
      );
    });
  });

  it('renders the connected account row + Disconnect button when an account exists', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 'acc-1',
          email: 'eliran@example.com',
          connectedAt: '2026-05-03T10:00:00Z',
          lastUsedAt: '2026-05-03T11:00:00Z',
        },
      ],
      status: 200,
    });
    renderPage();
    expect(await screen.findByText('eliran@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    // The "Connected" status badge surfaces — query by exact text so the
    // sub-line ("Connected May 3, 2026 · Last used …") doesn't collide.
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('opens the Disconnect confirm modal when the user clicks Disconnect', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 'acc-1',
          email: 'eliran@example.com',
          connectedAt: '2026-05-03T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      status: 200,
    });
    renderPage();
    const disconnect = await screen.findByRole('button', { name: /disconnect/i });
    await userEvent.click(disconnect);
    expect(
      await screen.findByRole('alertdialog', { name: /disconnect google drive/i }),
    ).toBeInTheDocument();
  });

  it('confirming Disconnect calls the delete mutation with the account id', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 'acc-1',
          email: 'eliran@example.com',
          connectedAt: '2026-05-03T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      status: 200,
    });
    mockedDelete.mockResolvedValueOnce({ status: 204 });
    // Refetch after mutation returns an empty list.
    mockedGet.mockResolvedValueOnce({ data: [], status: 200 });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /disconnect/i }));
    const dialog = await screen.findByRole('alertdialog', {
      name: /disconnect google drive/i,
    });
    const confirm = await screen.findByRole('button', { name: /^disconnect$/i });
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith('/integrations/gdrive/accounts/acc-1');
    });
    // Dialog closes after the mutation resolves.
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
