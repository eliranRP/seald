import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SecretOnceSheet } from './SecretOnceSheet';

const SECRET = 'seald_live_exampleSecretValue';

describe('SecretOnceSheet', () => {
  it('copies the secret, announces Copied, and closes from the Close button', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(<SecretOnceSheet secret={SECRET} onClose={onClose} />);
    const dialog = getByRole('dialog', { name: 'New key' });
    expect(dialog).toHaveAccessibleDescription(/only time it is shown/i);
    expect(dialog).toHaveTextContent(SECRET);
    await userEvent.click(getByRole('button', { name: 'Copy key' }));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(getByRole('status')).toHaveTextContent('Copied');
    await userEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a backdrop tap', async () => {
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(<SecretOnceSheet secret={SECRET} onClose={onClose} />);
    const dialog = getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before Close or Escape when the secret has not been copied', async () => {
    const onClose = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <SecretOnceSheet secret={SECRET} onClose={onClose} />,
    );
    await userEvent.keyboard('{Escape}');
    const confirm = getByRole('alertdialog', { name: 'Close without copying?' });
    expect(confirm).toHaveAccessibleDescription("You won't see this key again.");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(getByRole('button', { name: 'Keep open' }));
    expect(queryByRole('alertdialog')).toBeNull();
    await userEvent.click(getByRole('button', { name: 'Close' }));
    await userEvent.click(getByRole('button', { name: 'Close anyway' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('selects the secret and explains a clipboard failure', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });
    const { getByRole, getByText } = renderWithTheme(
      <SecretOnceSheet secret={SECRET} onClose={vi.fn()} />,
    );
    await userEvent.click(getByRole('button', { name: 'Copy key' }));
    expect(getByRole('alert')).toHaveTextContent('Copy failed — select and copy manually');
    expect(getByText(SECRET)).toHaveFocus();
  });
});
