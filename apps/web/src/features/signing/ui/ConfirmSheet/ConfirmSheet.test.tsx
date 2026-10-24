import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ConfirmSheet } from './ConfirmSheet';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmSheet>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const view = renderWithTheme(
    <ConfirmSheet
      open
      onClose={onClose}
      onConfirm={onConfirm}
      title="Withdraw consent to sign electronically?"
      confirmLabel="Withdraw consent"
      cancelLabel="Keep signing"
      {...overrides}
    >
      The sender will be notified.
    </ConfirmSheet>,
  );
  return { onClose, onConfirm, ...view };
}

describe('ConfirmSheet', () => {
  it('confirms and cancels', async () => {
    const user = userEvent.setup();
    const { getByRole, onClose, onConfirm, container } = setup();
    expect(getByRole('dialog', { name: 'Withdraw consent to sign electronically?' })).toBeVisible();
    await user.click(getByRole('button', { name: 'Withdraw consent' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(getByRole('button', { name: 'Keep signing' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an error and locks the buttons while busy', () => {
    const { getByRole } = setup({ busy: true, error: 'Try again.' });
    expect(getByRole('alert')).toHaveTextContent('Try again.');
    expect(getByRole('button', { name: 'Keep signing' })).toBeDisabled();
  });
});
