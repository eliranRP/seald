import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SelectSignersPopover } from './SelectSignersPopover';
import type { SelectSignersPopoverSigner } from './SelectSignersPopover.types';

const SIGNERS: ReadonlyArray<SelectSignersPopoverSigner> = [
  { id: 's1', name: 'Alice Adams', color: '#6366F1' },
  { id: 's2', name: 'Bob Brown', color: '#10B981' },
  { id: 's3', name: 'Carol Chen', color: '#F59E0B' },
];

describe('SelectSignersPopover', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithTheme(
      <SelectSignersPopover open={false} signers={SIGNERS} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with title and signer list when open', () => {
    const { getByRole, getByText } = renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByRole('dialog')).toBeInTheDocument();
    expect(getByText('Select signers')).toBeInTheDocument();
    expect(getByText('Alice Adams')).toBeInTheDocument();
    expect(getByText('Bob Brown')).toBeInTheDocument();
    expect(getByText('Carol Chen')).toBeInTheDocument();
  });

  it('toggles selection state via aria-checked on click', async () => {
    const { getByRole } = renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    const alice = getByRole('checkbox', { name: 'Alice Adams' });
    expect(alice).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(alice);
    expect(alice).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(alice);
    expect(alice).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onApply with selected ids', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={onApply} onCancel={vi.fn()} />,
    );
    await userEvent.click(getByRole('checkbox', { name: 'Alice Adams' }));
    await userEvent.click(getByRole('button', { name: 'Apply' }));
    const firstCall = onApply.mock.calls[0];
    const ids = firstCall ? firstCall[0] : undefined;
    expect(ids).toEqual(['s1']);
  });

  it('fires onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when backdrop is clicked', async () => {
    const onCancel = vi.fn();
    const { getByTestId } = renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={vi.fn()} onCancel={onCancel} />,
    );
    // no semantic role: backdrop is a transparent click-target (rule 4.6 escape hatch)
    await userEvent.click(getByTestId('select-signers-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel on Escape key', async () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <SelectSignersPopover open signers={SIGNERS} onApply={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('seeds selection from initialSelectedIds', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <SelectSignersPopover
        open
        signers={SIGNERS}
        initialSelectedIds={['s1', 's3']}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole('checkbox', { name: 'Alice Adams' })).toHaveAttribute('aria-checked', 'true');
    expect(getByRole('checkbox', { name: 'Bob Brown' })).toHaveAttribute('aria-checked', 'false');
    expect(getByRole('checkbox', { name: 'Carol Chen' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(getByRole('button', { name: 'Apply' }));
    const firstCall = onApply.mock.calls[0];
    const ids = firstCall ? firstCall[0] : undefined;
    expect(ids).toEqual(['s1', 's3']);
  });

  it('resets selection when reopened with different initialSelectedIds', async () => {
    const { getByRole, queryByRole, rerender } = renderWithTheme(
      <SelectSignersPopover
        open
        signers={SIGNERS}
        initialSelectedIds={['s1']}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole('checkbox', { name: 'Alice Adams' })).toHaveAttribute('aria-checked', 'true');
    // Close
    rerender(
      <SelectSignersPopover
        open={false}
        signers={SIGNERS}
        initialSelectedIds={['s1']}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
    // Reopen with different seed
    rerender(
      <SelectSignersPopover
        open
        signers={SIGNERS}
        initialSelectedIds={['s2']}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole('checkbox', { name: 'Alice Adams' })).toHaveAttribute('aria-checked', 'false');
    expect(getByRole('checkbox', { name: 'Bob Brown' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has no axe violations when open', async () => {
    const { container } = renderWithTheme(
      <SelectSignersPopover
        open
        signers={SIGNERS}
        initialSelectedIds={['s1']}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
