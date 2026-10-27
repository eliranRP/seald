import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';

const exportData = vi.fn();
const deleteAccount = vi.fn();
let capturedOnDeleted: (() => void | Promise<void>) | undefined;
let capturedOnError: ((message: string) => void) | undefined;
vi.mock('@/features/account', () => ({
  useAccountActions: (opts: {
    onAccountDeleted?: () => void | Promise<void>;
    onError?: (message: string) => void;
  }) => {
    capturedOnDeleted = opts.onAccountDeleted;
    capturedOnError = opts.onError;
    return { exportData, deleteAccount, isExporting: false, isDeleting: false, lastError: null };
  },
}));

import { AccountSection } from './AccountSection';

function renderAccount(signOut = vi.fn().mockResolvedValue(undefined)) {
  renderWithProviders(
    <MemoryRouter initialEntries={['/settings/account']}>
      <Routes>
        <Route path="/settings/account" element={<AccountSection />} />
        <Route path="/signin" element={<h1>signin stub</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth: { signOut } },
  );
  return signOut;
}

describe('AccountSection', () => {
  beforeEach(() => {
    exportData.mockReset();
    deleteAccount.mockReset().mockResolvedValue(undefined);
    capturedOnDeleted = undefined;
    capturedOnError = undefined;
  });

  it('downloads the data on request', async () => {
    renderAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(exportData).toHaveBeenCalledTimes(1);
  });

  it('signs out and goes to /signin', async () => {
    const signOut = renderAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'signin stub' })).toBeInTheDocument();
  });

  it('keeps Delete account disabled until DELETE is typed exactly', async () => {
    const user = userEvent.setup();
    renderAccount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your account?' });
    expect(dialog).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Delete account' });
    const field = screen.getByRole('textbox', { name: 'Type DELETE to confirm' });
    expect(confirm).toBeDisabled();
    await user.type(field, 'delete');
    expect(confirm).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'DELETE');
    expect(confirm).toBeEnabled();
  });

  it('deletes after the confirmation and signs the user out', async () => {
    const user = userEvent.setup();
    const signOut = renderAccount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.type(screen.getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
    await capturedOnDeleted?.();
    expect(signOut).toHaveBeenCalled();
  });

  it('Cancel closes the dialog without deleting, and a reopen starts empty', async () => {
    const user = userEvent.setup();
    renderAccount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.type(screen.getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DEL');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('textbox', { name: 'Type DELETE to confirm' })).toHaveValue('');
  });

  it('a failed export shows an error toast instead of a browser alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderAccount();
    exportData.mockImplementation(() => {
      capturedOnError?.('Export failed. Please try again later.');
      return Promise.resolve();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent("Couldn't prepare your data");
    expect(toast).toHaveTextContent('Export failed. Please try again later.');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('a failed delete keeps the dialog open and says why', async () => {
    const user = userEvent.setup();
    renderAccount();
    deleteAccount.mockImplementation(() => {
      capturedOnError?.('Account deletion failed. Please try again later.');
      return Promise.resolve();
    });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.type(screen.getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your account?' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Account deletion failed. Please try again later.',
    );
    expect(screen.getByRole('textbox', { name: 'Type DELETE to confirm' })).toHaveValue('DELETE');
  });

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup();
    renderAccount();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
