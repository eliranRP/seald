import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ExitConfirmDialog } from './ExitConfirmDialog';

describe('ExitConfirmDialog', () => {
  it('renders nothing when closed', () => {
    renderWithTheme(<ExitConfirmDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('uses default copy when title / description are not supplied', () => {
    renderWithTheme(<ExitConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(/leave without sending/i);
    expect(screen.getByRole('button', { name: /leave anyway/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
  });

  it('confirm button fires onConfirm; cancel fires onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(<ExitConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /leave anyway/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape key cancels the dialog', () => {
    const onCancel = vi.fn();
    renderWithTheme(<ExitConfirmDialog open onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <ExitConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
