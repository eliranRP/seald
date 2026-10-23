import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ShortcutsPopover } from './ShortcutsPopover';

describe('ShortcutsPopover', () => {
  it('renders nothing while closed', () => {
    const { queryByRole } = renderWithTheme(<ShortcutsPopover open={false} onClose={() => {}} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('lists the shortcuts including redo', () => {
    const { getByRole, getByText } = renderWithTheme(<ShortcutsPopover open onClose={() => {}} />);
    expect(getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(getByText('Redo')).toBeInTheDocument();
    expect(getByText('Select many')).toBeInTheDocument();
  });

  it('closes with the button and with Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(<ShortcutsPopover open onClose={onClose} />);
    fireEvent.click(getByRole('button', { name: 'Close shortcuts' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<ShortcutsPopover open onClose={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
