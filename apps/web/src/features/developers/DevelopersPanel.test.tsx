import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { DevelopersPanel } from './DevelopersPanel';
import { FAKE_SECRET, fakeKey, fakeKeys } from './fixtures';

function listReturns(items: ReadonlyArray<ReturnType<typeof fakeKey>>): void {
  getMock.mockResolvedValue({ data: { items } });
}

function renderPanel(signOut: () => Promise<void> = () => Promise.resolve()) {
  return renderWithProviders(
    <MemoryRouter>
      <DevelopersPanel />
    </MemoryRouter>,
    { auth: { signOut } },
  );
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe('DevelopersPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('one tap on "New key" creates a key with an empty body and shows the secret once', async () => {
    const user = userEvent.setup();
    listReturns([]);
    postMock.mockResolvedValue({ data: { key: fakeKey(), secret: FAKE_SECRET } });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'New key' }));

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/me/api-keys', {});
    const dialog = await screen.findByRole('dialog', { name: 'Your new key' });
    expect(within(dialog).getByLabelText('Secret value')).toHaveTextContent(FAKE_SECRET);
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(FAKE_SECRET, { exact: false })).not.toBeInTheDocument();
  });

  it('shows connect snippets with <YOUR_KEY> only, and Later tiles', async () => {
    listReturns([]);
    renderPanel();

    const claudeCode = await screen.findByRole('group', { name: 'Claude Code' });
    const cursor = screen.getByRole('group', { name: 'Cursor' });
    expect(claudeCode).toHaveTextContent('<YOUR_KEY>');
    expect(cursor).toHaveTextContent('<YOUR_KEY>');
    expect(screen.getByRole('group', { name: 'Server URL' })).toHaveTextContent('/mcp');
    expect(screen.getByRole('button', { name: 'Copy Server URL' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/seald_live_x{10}/);

    const tiles = screen.getByRole('list', { name: 'Other apps' });
    expect(within(tiles).getByText('ChatGPT')).toBeInTheDocument();
    expect(within(tiles).getByText('Claude app')).toBeInTheDocument();
    expect(within(tiles).getAllByText('Later')).toHaveLength(2);
  });

  it('lists name, prefix and expiry, and marks a past-expiry key Expired', async () => {
    listReturns([
      fakeKey(),
      fakeKey({
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Key 2',
        prefix: 'seald_live_yyyyyyyy',
        status: 'expired',
        expires_at: '2020-01-01T00:00:00.000Z',
      }),
    ]);
    renderPanel();

    const list = await screen.findByRole('list', { name: 'API keys' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Key 1');
    expect(rows[0]).toHaveTextContent('seald_live_xxxxxxxx');
    expect(rows[0]).toHaveTextContent('Expires');
    expect(within(rows[0] as HTMLElement).queryByText('Expired')).not.toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Expired')).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Revoke Key 2' }),
    ).toBeEnabled();
  });

  it('hides last used, scope labels and "Always require sign-in" behind Advanced', async () => {
    const user = userEvent.setup();
    listReturns([fakeKey({ last_used_at: '2026-10-02T00:00:00.000Z' })]);
    renderPanel();

    const list = await screen.findByRole('list', { name: 'API keys' });
    expect(within(list).queryByText(/last used/i)).not.toBeInTheDocument();
    expect(within(list).queryByText('Read documents')).not.toBeInTheDocument();
    expect(within(list).queryByText(/always require sign-in/i)).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Advanced details for Key 1' }));
    expect(within(list).getByText(/last used/i)).toBeInTheDocument();
    expect(within(list).getByText('Read documents')).toBeInTheDocument();
    expect(within(list).getByText(/always require sign-in: off/i)).toBeInTheDocument();
  });

  it('asks once before revoking, with focus on Cancel', async () => {
    const user = userEvent.setup();
    listReturns([fakeKey()]);
    postMock.mockResolvedValue({ data: { revoked: true } });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Revoke Key 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Key 1?' });
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
    expect(postMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(postMock).toHaveBeenCalledWith(
      '/me/api-keys/00000000-0000-4000-8000-000000000001/revoke',
    );
  });

  it('Advanced create pre-checks only envelopes:read, has no Never choice, and defaults to 90 days', async () => {
    const user = userEvent.setup();
    listReturns([]);
    postMock.mockResolvedValue({ data: { key: fakeKey({ name: 'CI' }), secret: FAKE_SECRET } });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Advanced new key options' }));

    const checked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Read documents' })).toBeChecked();
    for (const name of ['Account changes', 'Key changes', 'Sign requests', 'Send and remind']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
    expect(screen.getByRole('checkbox', { name: 'Always require sign-in' })).not.toBeChecked();
    expect(screen.queryByRole('radio', { name: /never/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '90 days' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '30 days' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '365 days' })).not.toBeChecked();

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(screen.getByRole('radio', { name: '30 days' }));
    await user.click(screen.getByRole('checkbox', { name: 'Read contacts' }));
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    expect(postMock).toHaveBeenCalledTimes(1);
    const body = postMock.mock.calls[0]?.[1] as {
      name: string;
      scopes: string[];
      expires_at: string;
    };
    expect(body.name).toBe('CI');
    expect(body.scopes).toEqual(['envelopes:read', 'contacts:read']);
    const days = (new Date(body.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('cannot create a key with no scope', async () => {
    const user = userEvent.setup();
    listReturns([]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Advanced new key options' }));
    await user.click(screen.getByRole('checkbox', { name: 'Read documents' }));
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  });

  it('shows the sign-in-again prompt when a key with a send scope needs a fresh sign-in', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(() => Promise.resolve());
    listReturns([]);
    postMock.mockRejectedValue(httpError(403, 'Forbidden'));
    renderPanel(signOut);

    await user.click(await screen.findByRole('button', { name: 'Advanced new key options' }));
    await user.click(screen.getByRole('checkbox', { name: 'Send and remind' }));
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign in again to create this key.');
    await user.click(within(alert).getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('a 403 on the default create is the email-required message, not a re-sign-in', async () => {
    const user = userEvent.setup();
    listReturns([]);
    postMock.mockRejectedValue(httpError(403, 'Forbidden'));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'New key' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign in with an email account to create keys.');
    expect(within(alert).queryByRole('button', { name: 'Sign in again' })).not.toBeInTheDocument();
  });

  it('disables New key at 10 live keys', async () => {
    listReturns(fakeKeys(10));
    renderPanel();

    expect(await screen.findByRole('button', { name: 'New key' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Revoke Key/ })).toHaveLength(10);
  });

  it('keeps the signature note behind Advanced', async () => {
    const user = userEvent.setup();
    listReturns([]);
    renderPanel();

    await screen.findByRole('button', { name: 'New key' });
    expect(screen.queryByText(/simple electronic signature/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Advanced signature note' }));
    expect(screen.getByText(/simple electronic signature/i)).toBeInTheDocument();
  });

  it('renders the not-available state when the API answers 404', async () => {
    getMock.mockRejectedValue(httpError(404, 'Not Found'));
    renderPanel();

    expect(await screen.findByText('Not available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New key' })).not.toBeInTheDocument();
  });
});
