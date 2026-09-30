import { describe, expect, it, vi } from 'vitest';
import { cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTheme } from '@/test/renderWithTheme';
import { DevelopersKeysScreen } from './DevelopersKeysScreen';
import type { ApiKeyListItem, DevelopersKeysScreenProps } from './types';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

const liveKey: ApiKeyListItem = {
  id: 'k1',
  name: 'Key 1',
  prefix: 'seald_live_abcd1234',
  scopes: ['envelopes:read', 'envelopes:write'],
  last_used_at: '2026-09-28T00:00:00.000Z',
  expires_at: '2026-12-29T00:00:00.000Z',
};

function renderScreen(override: Partial<DevelopersKeysScreenProps> = {}) {
  const onCreate = vi.fn();
  const onRevoke = vi.fn();
  const onDismissSecret = vi.fn();
  const onRetry = vi.fn();
  const view = renderWithTheme(
    <MemoryRouter>
      <DevelopersKeysScreen
        layout="phone"
        keys={[]}
        now={NOW}
        onCreate={onCreate}
        onRevoke={onRevoke}
        onDismissSecret={onDismissSecret}
        onRetry={onRetry}
        {...override}
      />
    </MemoryRouter>,
  );
  return { ...view, onCreate, onRevoke, onDismissSecret, onRetry };
}

describe('DevelopersKeysScreen', () => {
  it('keeps the intro to one sentence and creates a key in one click', async () => {
    const { getByRole, getByText, queryByRole, onCreate } = renderScreen();
    expect(
      getByText(
        'Keys let an app prepare and send for you. Signers still sign from their own link.',
      ),
    ).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Send' })).toBeNull();
    expect(getByRole('button', { name: 'Advanced' })).toBeInTheDocument();
    await userEvent.click(getByRole('button', { name: 'New key' }));
    expect(onCreate).toHaveBeenCalledWith({});
  });

  it('sends scopes and expiry only after Advanced, without Send', async () => {
    const { getByRole, queryByRole, onCreate } = renderScreen();
    await userEvent.click(getByRole('button', { name: 'Advanced' }));
    expect(queryByRole('checkbox', { name: /^send$/i })).toBeNull();
    expect(getByRole('checkbox', { name: 'Read envelopes' })).toBeChecked();
    expect(getByRole('radio', { name: '90 d' })).toBeChecked();
    await userEvent.click(getByRole('checkbox', { name: 'Prepare envelopes' }));
    await userEvent.click(getByRole('radio', { name: '30 d' }));
    await userEvent.click(getByRole('checkbox', { name: 'Always require sign-in' }));
    await userEvent.click(getByRole('button', { name: 'New key' }));
    const payload = onCreate.mock.calls[0]?.[0] as {
      scopes: string[];
      expires_at: string;
      always_require_signin: boolean;
    };
    expect(payload.scopes).toEqual(['envelopes:read', 'envelopes:write']);
    expect(payload.always_require_signin).toBe(true);
    expect(Date.parse(payload.expires_at)).toBe(NOW + 30 * 24 * 60 * 60 * 1000);
  });

  it('does not say there are no keys while loading', () => {
    const { queryByText, getByText } = renderScreen({ status: 'loading' });
    expect(queryByText('No keys yet.')).toBeNull();
    expect(getByText('Loading…')).toBeInTheDocument();
  });

  it('offers Try again when keys fail to load', async () => {
    const { getByRole, onRetry, queryByRole } = renderScreen({ status: 'error' });
    expect(getByRole('alert')).toHaveTextContent('Could not load keys.');
    expect(queryByRole('button', { name: 'New key' })).toBeNull();
    await userEvent.click(getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a neutral cap message only at 10 unexpired keys', () => {
    const keys = Array.from({ length: 10 }, (_, index) => ({
      ...liveKey,
      id: `k${index}`,
      name: `Key ${index + 1}`,
    }));
    const { getByText, queryByText } = renderScreen({ keys });
    expect(getByText('You have 10 keys. Revoke one to add another.')).toBeInTheDocument();
    expect(queryByText('10 of 10')).toBeNull();
    cleanup();
    const expired = keys.map((key, index) =>
      index === 0 ? { ...key, expires_at: '2026-01-01T00:00:00.000Z' } : key,
    );
    const again = renderScreen({ keys: expired });
    expect(again.queryByText('You have 10 keys. Revoke one to add another.')).toBeNull();
  });

  it('shows last used and scopes on one line, and an expired date', () => {
    const { getByText } = renderScreen({
      keys: [
        liveKey,
        {
          ...liveKey,
          id: 'k2',
          name: 'Key 2',
          prefix: 'seald_live_zzzz5678',
          expires_at: '2026-01-01T00:00:00.000Z',
          last_used_at: null,
        },
      ],
    });
    expect(
      getByText('Last used Sep 28, 2026 · Read envelopes, Prepare envelopes'),
    ).toBeInTheDocument();
    expect(getByText('Expired Jan 1, 2026')).toBeInTheDocument();
    expect(getByText('seald_live_abcd1234')).toHaveAttribute('dir', 'ltr');
  });

  it('focuses Cancel, describes the prefix, and returns focus after Escape', async () => {
    const { getByRole, onRevoke } = renderScreen({ keys: [liveKey] });
    const revoke = getByRole('button', { name: 'Revoke' });
    revoke.focus();
    await userEvent.click(revoke);
    const dialog = getByRole('alertdialog', { name: 'Revoke Key 1?' });
    expect(dialog).toHaveAccessibleDescription('Apps using seald_live_abcd1234 stop working now.');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onRevoke).not.toHaveBeenCalled();
    expect(revoke).toHaveFocus();
    await userEvent.click(revoke);
    await userEvent.click(within(getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }));
    expect(onRevoke).toHaveBeenCalledWith('k1');
  });

  it('clears the secret from the screen after the sheet closes', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
    const secret = 'seald_live_shownOnceOnly';
    const onDismissSecret = vi.fn();
    const { getByRole, queryByText, rerender } = renderWithTheme(
      <MemoryRouter>
        <DevelopersKeysScreen
          layout="desktop"
          keys={[liveKey]}
          now={NOW}
          revealedSecret={secret}
          onCreate={() => {}}
          onRevoke={() => {}}
          onDismissSecret={onDismissSecret}
        />
      </MemoryRouter>,
    );
    expect(getByRole('dialog', { name: 'New key' })).toHaveTextContent(secret);
    await userEvent.click(getByRole('button', { name: 'Copy key' }));
    await userEvent.click(getByRole('button', { name: 'Close' }));
    expect(onDismissSecret).toHaveBeenCalledTimes(1);
    rerender(
      <MemoryRouter>
        <DevelopersKeysScreen
          layout="desktop"
          keys={[liveKey]}
          now={NOW}
          revealedSecret={null}
          onCreate={() => {}}
          onRevoke={() => {}}
          onDismissSecret={onDismissSecret}
        />
      </MemoryRouter>,
    );
    expect(queryByText(secret)).toBeNull();
  });

  it('shows a toast after revoke', () => {
    const { getByRole } = renderScreen({ keys: [liveKey], toast: 'Key revoked.' });
    expect(getByRole('status')).toHaveTextContent('Key revoked.');
  });
});
