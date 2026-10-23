import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

describe('ConfirmDeleteDialog', () => {
  it('renders nothing while closed', () => {
    const { queryByRole } = renderWithTheme(
      <ConfirmDeleteDialog
        open={false}
        title="Delete NDA?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('names the dialog by its title and shows the note and extra content', () => {
    const { getByRole, getByText } = renderWithTheme(
      <ConfirmDeleteDialog
        open
        title="Delete NDA — standard?"
        note="Sent documents stay."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <span>three avatars</span>
      </ConfirmDeleteDialog>,
    );
    expect(getByRole('alertdialog', { name: 'Delete NDA — standard?' })).toBeInTheDocument();
    expect(getByText('Sent documents stay.')).toBeInTheDocument();
    expect(getByText('three avatars')).toBeInTheDocument();
  });

  it('puts focus on Keep and confirms only through Delete', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <ConfirmDeleteDialog open title="Delete?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(getByRole('button', { name: 'Keep' })).toHaveFocus();
    fireEvent.click(getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Keep, Escape and a click on the scrim', () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <ConfirmDeleteDialog open title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(getByRole('button', { name: 'Keep' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(getByRole('alertdialog').parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('uses custom button labels', () => {
    const { getByRole } = renderWithTheme(
      <ConfirmDeleteDialog
        open
        title="Delete 3 contacts?"
        keepLabel="Cancel"
        deleteLabel="Delete 3"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Delete 3' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <ConfirmDeleteDialog
        open
        title="Delete?"
        note="Sent documents stay."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
