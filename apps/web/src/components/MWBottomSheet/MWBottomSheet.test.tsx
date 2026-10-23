import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { MWBottomSheet } from './MWBottomSheet';

describe('MWBottomSheet', () => {
  it('renders nothing while closed', () => {
    renderWithTheme(
      <MWBottomSheet open={false} onClose={() => undefined} title="Sheet">
        <button type="button">Inside</button>
      </MWBottomSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named by its title', () => {
    renderWithTheme(
      <MWBottomSheet open onClose={() => undefined} title="Add a signer">
        <button type="button">Inside</button>
      </MWBottomSheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add a signer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus to the first field on open', () => {
    renderWithTheme(
      <MWBottomSheet open onClose={() => undefined} title="Sheet">
        <button type="button">Other</button>
        <input aria-label="Name" />
      </MWBottomSheet>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('closes on Escape and on backdrop tap, not on taps inside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithTheme(
      <MWBottomSheet open onClose={onClose} title="Sheet">
        <button type="button">Inside</button>
      </MWBottomSheet>,
    );
    await user.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = renderWithTheme(
      <MWBottomSheet open onClose={() => undefined} title="Sheet">
        <span>x</span>
      </MWBottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <MWBottomSheet open={false} onClose={() => undefined} title="Sheet">
        <span>x</span>
      </MWBottomSheet>,
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
