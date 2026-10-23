import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SecretOnceSheet } from './SecretOnceSheet';

const SECRET = 'seald_live_abc123';

describe('SecretOnceSheet', () => {
  it('renders nothing while closed', () => {
    renderWithTheme(
      <SecretOnceSheet open={false} onClose={() => undefined} title="Key" secret={SECRET} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('shows the full secret with Copy and Close only', () => {
    renderWithTheme(<SecretOnceSheet open onClose={() => undefined} title="Key" secret={SECRET} />);
    expect(screen.getByRole('dialog', { name: 'Key' })).toBeInTheDocument();
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('copies the secret', async () => {
    const user = userEvent.setup();
    renderWithTheme(<SecretOnceSheet open onClose={() => undefined} title="Key" secret={SECRET} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(SECRET);
  });

  it('calls onClose from Close and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithTheme(<SecretOnceSheet open onClose={onClose} title="Key" secret={SECRET} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
