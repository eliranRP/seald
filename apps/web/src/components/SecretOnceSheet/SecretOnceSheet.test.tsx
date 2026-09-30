import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SecretOnceSheet } from './SecretOnceSheet';

const SECRET = 'seald_live_exampleSecretValue';

describe('SecretOnceSheet', () => {
  it('copies the secret and closes without a confirmation checkbox', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onClose = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <SecretOnceSheet secret={SECRET} onClose={onClose} />,
    );
    expect(queryByRole('checkbox')).toBeNull();
    expect(getByRole('dialog')).toHaveTextContent(SECRET);
    await userEvent.click(getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    await userEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderWithTheme(<SecretOnceSheet secret={SECRET} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
