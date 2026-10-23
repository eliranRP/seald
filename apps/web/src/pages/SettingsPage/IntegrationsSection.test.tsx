import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));
import { apiClient } from '@/lib/api/apiClient';
import { IntegrationsSection } from './IntegrationsSection';

const mockedGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockedDelete = apiClient.delete as ReturnType<typeof vi.fn>;
const openSpy = vi.fn();

const ACCOUNT = {
  id: 'acc-1',
  email: 'eliran@gmail.com',
  connectedAt: '2026-10-02T10:00:00.000Z',
  lastUsedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  tokenStatus: 'live',
};

function serve(accounts: unknown[], oauth: 'ok' | 503 = 'ok'): void {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/integrations/gdrive/accounts') return Promise.resolve({ data: accounts });
    if (url === '/integrations/gdrive/oauth/url') {
      if (oauth === 503) {
        return Promise.reject(Object.assign(new Error('not configured'), { status: 503 }));
      }
      return Promise.resolve({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' } });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderSection(path = '/settings/integrations') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <IntegrationsSection />
    </MemoryRouter>,
  );
}

describe('IntegrationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'open', { value: openSpy, writable: true });
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('not connected: Connect opens the Google consent popup', async () => {
    serve([]);
    renderSection();
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        'gdrive-oauth',
        expect.any(String),
      ),
    );
  });

  it('lists Dropbox and OneDrive as quiet Soon rows', async () => {
    serve([]);
    renderSection();
    expect(await screen.findByText('Dropbox')).toBeInTheDocument();
    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.getAllByText('Soon')).toHaveLength(2);
  });

  it('connected: shows the account with when it was connected and last used', async () => {
    serve([ACCOUNT]);
    renderSection();
    expect(await screen.findByText('eliran@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('1 account connected')).toBeInTheDocument();
    expect(screen.getByText(/Connected Oct 2 · used 2h ago/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^connect/i })).not.toBeInTheDocument();
  });

  it('Add account shows only with multi-account on', async () => {
    serve([ACCOUNT]);
    const first = renderSection();
    await screen.findByText('eliran@gmail.com');
    expect(screen.queryByRole('button', { name: 'Add account' })).not.toBeInTheDocument();
    first.unmount();

    vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
      (flag: string) => flag === 'gdriveMultiAccount',
    );
    renderSection();
    expect(await screen.findByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });

  it('reconnect needed: badge and a primary Reconnect that forces consent', async () => {
    serve([{ ...ACCOUNT, tokenStatus: 'reconnect_required' }]);
    renderSection();
    expect(await screen.findByText('Reconnect needed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect eliran@gmail.com' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(String(openSpy.mock.calls[0]?.[0])).toContain('prompt=consent');
  });

  it('Disconnect asks first, then deletes the account', async () => {
    serve([ACCOUNT]);
    mockedDelete.mockResolvedValue({});
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Disconnect eliran@gmail.com' }),
    );
    const dialog = screen.getByRole('alertdialog', { name: /disconnect google drive/i });
    expect(within(dialog).getByText('Imported files keep working.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith('/integrations/gdrive/accounts/acc-1'),
    );
  });

  it('Keep closes the dialog without deleting', async () => {
    serve([ACCOUNT]);
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Disconnect eliran@gmail.com' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('not configured: a 503 shows the banner with no env var names and disables Connect', async () => {
    serve([], 503);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /connect/i }));
    const banner = await screen.findByText("Drive isn't set up on this server.");
    expect(banner).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/GDRIVE_|CLIENT_ID|CLIENT_SECRET/);
    expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('OAuth popup landing: posts back to the opener and closes', async () => {
    serve([]);
    const postMessage = vi.fn();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    Object.defineProperty(window, 'opener', {
      value: { postMessage },
      writable: true,
      configurable: true,
    });
    renderSection('/settings/integrations?connected=1');
    expect(await screen.findByText(/closing this window/i)).toBeInTheDocument();
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'gdrive-oauth-complete' },
      window.location.origin,
    );
    expect(close).toHaveBeenCalled();
  });
});
