import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

import { apiClient, type ApiError } from '../../../lib/api/apiClient';
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

  it('shows a friendly inline alert and does NOT open Google when /oauth/url returns 503', async () => {
    // Phase 6.A iter-1 round-1 LOCAL bug companion: when the API
    // returns 503 `gdrive_oauth_not_configured` (server missing
    // GDRIVE_OAUTH_CLIENT_ID / _CLIENT_SECRET), the page must surface a
    // friendly alert ("Drive integration is not configured on this
    // server") instead of bouncing the user to a broken Google URL.
    // Pre-fix behaviour: window.open() was called with whatever the
    // (now-throwing) call resolved to — the user saw Google's
    // "Missing required parameter: client_id" error page.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/integrations/gdrive/accounts') {
        return Promise.resolve({ data: [], status: 200 });
      }
      if (url === '/integrations/gdrive/oauth/url') {
        const err: ApiError = new Error('gdrive_oauth_not_configured');
        err.status = 503;
        return Promise.reject(err);
      }
      return Promise.resolve({ data: {}, status: 200 });
    });
    renderPage();
    const button = await screen.findByRole('button', { name: /connect google drive/i });
    await userEvent.click(button);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not configured/i);
    expect(openSpy).not.toHaveBeenCalled();
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

  it('the 503 config-error alert can be dismissed via its Close button', async () => {
    // Phase 6.A iter-2 LOCAL bug. Pre-fix the 503 alert appeared the
    // first time the user clicked Connect and had no way to be
    // dismissed — it sat on top of the page until the user attempted
    // another mutate(). Worse, on the empty-state surface the user is
    // led to click Connect to even discover the misconfiguration, and
    // then has no path back to a clean view. Post-fix the alert ships
    // an explicit Dismiss button that resets the connect mutation
    // state so the alert disappears.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/integrations/gdrive/accounts') {
        return Promise.resolve({ data: [], status: 200 });
      }
      if (url === '/integrations/gdrive/oauth/url') {
        const err: ApiError = new Error('gdrive_oauth_not_configured');
        err.status = 503;
        return Promise.reject(err);
      }
      return Promise.resolve({ data: {}, status: 200 });
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /connect google drive/i }));
    const alert = await screen.findByRole('alert');
    const dismiss = within(alert).getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows an inline error inside the disconnect modal when the mutation fails', async () => {
    // Phase 6.A iter-2 LOCAL bug. Pre-fix when the DELETE
    // /integrations/gdrive/accounts/:id call rejected, the modal's
    // pending state cleared but no error feedback surfaced. The user
    // could not tell whether the click registered. Post-fix the
    // modal renders an inline error sourced from the page's
    // disconnect mutation and re-enables Cancel + Disconnect for
    // retry.
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
    const failure: ApiError = new Error('drive_disconnect_failed');
    failure.status = 500;
    mockedDelete.mockRejectedValueOnce(failure);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /disconnect/i }));
    const dialog = await screen.findByRole('alertdialog', {
      name: /disconnect google drive/i,
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /^disconnect$/i }));
    // Mutation rejects -> modal stays open + inline error appears.
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/couldn.?t disconnect/i);
    // Both buttons usable for retry/back-out.
    expect(within(dialog).getByRole('button', { name: /^disconnect$/i })).not.toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /cancel/i })).not.toBeDisabled();
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
