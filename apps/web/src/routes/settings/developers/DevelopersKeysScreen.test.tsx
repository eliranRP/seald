import { describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
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
  scopes: ['envelopes:read'],
  require_owner_approval: true,
  allow_new_recipients: false,
  always_require_signin: false,
  approval_notify: 'email',
  last_used_at: null,
  expires_at: '2026-12-29T00:00:00.000Z',
};

function renderScreen(override: Partial<DevelopersKeysScreenProps> = {}) {
  const onCreate = vi.fn();
  const onRevoke = vi.fn();
  const onPatch = vi.fn();
  const onDismissSecret = vi.fn();
  const onNeedFreshLogin = vi.fn();
  const view = renderWithTheme(
    <MemoryRouter>
      <DevelopersKeysScreen
        layout="phone"
        keys={[]}
        now={NOW}
        sendLoginFresh
        onCreate={onCreate}
        onRevoke={onRevoke}
        onPatch={onPatch}
        onDismissSecret={onDismissSecret}
        onNeedFreshLogin={onNeedFreshLogin}
        {...override}
      />
    </MemoryRouter>,
  );
  return { ...view, onCreate, onRevoke, onPatch, onDismissSecret, onNeedFreshLogin };
}

describe('DevelopersKeysScreen', () => {
  it('creates a key in one click', async () => {
    const { getByRole, onCreate } = renderScreen();
    await userEvent.click(getByRole('button', { name: 'New key' }));
    expect(onCreate).toHaveBeenCalledWith({});
  });

  it('sends scopes and expiry only after Advanced', async () => {
    const { getAllByRole, getByRole, onCreate } = renderScreen();
    await userEvent.click(getAllByRole('button', { name: 'Advanced' })[1]!);
    await userEvent.click(getByRole('checkbox', { name: /send/i }));
    await userEvent.click(getByRole('radio', { name: '30 days' }));
    await userEvent.click(getByRole('button', { name: 'New key' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ['envelopes:read', 'envelopes:send'],
        always_require_signin: false,
      }),
    );
    const payload = onCreate.mock.calls[0]?.[0] as { expires_at: string };
    expect(Date.parse(payload.expires_at)).toBe(NOW + 30 * 24 * 60 * 60 * 1000);
  });

  it('asks for a fresh sign-in before a Send scope when the session is old', async () => {
    const { getAllByRole, getByRole, onCreate, onNeedFreshLogin } = renderScreen({
      sendLoginFresh: false,
    });
    await userEvent.click(getAllByRole('button', { name: 'Advanced' })[1]!);
    await userEvent.click(getByRole('checkbox', { name: /^send/i }));
    await userEvent.click(getByRole('button', { name: 'New key' }));
    expect(onNeedFreshLogin).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the secret once and keeps it out of snippets after close', async () => {
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
          onPatch={() => {}}
          onDismissSecret={onDismissSecret}
          onNeedFreshLogin={() => {}}
        />
      </MemoryRouter>,
    );
    expect(getByRole('dialog', { name: 'New key' })).toHaveTextContent(secret);
    expect(getByRole('figure', { name: 'Cursor' })).toHaveTextContent(secret);
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
          onPatch={() => {}}
          onDismissSecret={onDismissSecret}
          onNeedFreshLogin={() => {}}
        />
      </MemoryRouter>,
    );
    expect(queryByText(secret)).toBeNull();
    expect(getByRole('figure', { name: 'Cursor' })).toHaveTextContent('<YOUR_KEY>');
  });

  it('focuses Cancel and revokes after confirm', async () => {
    const { getByRole, onRevoke } = renderScreen({ keys: [liveKey] });
    await userEvent.click(getByRole('button', { name: 'Revoke' }));
    const cancel = getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await userEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    expect(onRevoke).toHaveBeenCalledWith('k1');
  });

  it('marks a past expiry as Expired', () => {
    const { getByText } = renderScreen({
      keys: [{ ...liveKey, expires_at: '2026-01-01T00:00:00.000Z' }],
    });
    expect(getByText('Expired')).toBeInTheDocument();
  });

  it('asks before send-without-waiting', async () => {
    const { getAllByRole, getByRole, onPatch } = renderScreen({ keys: [liveKey] });
    await userEvent.click(getAllByRole('button', { name: 'Advanced' })[2]!);
    await userEvent.click(getByRole('checkbox', { name: /send without waiting/i }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(getByRole('dialog')).toHaveTextContent(/counts as your approval/i);
    await userEvent.click(getByRole('button', { name: 'Turn on' }));
    expect(onPatch).toHaveBeenCalledWith('k1', { require_owner_approval: false });
  });
});
