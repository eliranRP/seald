import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '@/test/renderWithTheme';

const exportData = vi.fn(() => Promise.resolve());
vi.mock('@/features/account', () => ({
  useAccountActions: () => ({ exportData, isExporting: false }),
}));

import { OwnerActionDone } from './OwnerActionDone';
import { FAKE_KEY_SECRET, fakeOwnerDetail } from './fixtures';

describe('OwnerActionDone (WP-45)', () => {
  it('shows a new key once; closing drops it', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <OwnerActionDone
        detail={fakeOwnerDetail('api_key_create', {
          status: 'done',
          reveal: { api_key_secret: FAKE_KEY_SECRET },
        })}
        onAccountDeleted={vi.fn()}
      />,
    );
    expect(screen.getByText(FAKE_KEY_SECRET)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close|done/i }));
    expect(screen.queryByText(FAKE_KEY_SECRET)).not.toBeInTheDocument();
    expect(screen.getByText(/shown once when you approved/)).toBeInTheDocument();
  });

  it('a done key read later (no reveal) never shows a secret', () => {
    renderWithTheme(
      <OwnerActionDone
        detail={fakeOwnerDetail('api_key_create', { status: 'done' })}
        onAccountDeleted={vi.fn()}
      />,
    );
    expect(screen.queryByText(/seald_live_/)).not.toBeInTheDocument();
  });

  it('an approved export downloads in this browser', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <OwnerActionDone
        detail={fakeOwnerDetail('account_export', { status: 'done' })}
        onAccountDeleted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Download your data' }));
    expect(exportData).toHaveBeenCalledTimes(1);
  });

  it('an approved deletion signs out', () => {
    const onAccountDeleted = vi.fn();
    renderWithTheme(
      <OwnerActionDone
        detail={fakeOwnerDetail('account_delete', { status: 'done' })}
        onAccountDeleted={onAccountDeleted}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Your account was deleted');
    expect(onAccountDeleted).toHaveBeenCalledTimes(1);
  });
});
