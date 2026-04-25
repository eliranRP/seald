import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { RemoveLinkedCopiesDialog } from './RemoveLinkedCopiesDialog';

describe('RemoveLinkedCopiesDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithTheme(
      <RemoveLinkedCopiesDialog
        open={false}
        linkedCount={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('exposes a labelled dialog with role=dialog and aria-modal', () => {
    const { getByRole } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={3} onConfirm={() => {}} onCancel={() => {}} />,
    );
    const dialog = getByRole('dialog', { name: 'Remove linked copies' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('defaults the scope radio to "Only this page"', () => {
    const { getByRole } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={3} onConfirm={() => {}} onCancel={() => {}} />,
    );
    const onlyThis = getByRole('radio', { name: 'Only this page' }) as HTMLInputElement;
    const allPages = getByRole('radio', { name: /All pages/ }) as HTMLInputElement;
    expect(onlyThis.checked).toBe(true);
    expect(allPages.checked).toBe(false);
  });

  it('shows "All pages (N)" when linkedCount > 1, plain "All pages" when count is 1', () => {
    const { getByRole, rerender } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={4} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(getByRole('radio', { name: 'All pages (4)' })).toBeInTheDocument();

    rerender(
      <RemoveLinkedCopiesDialog open linkedCount={1} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(getByRole('radio', { name: 'All pages' })).toBeInTheDocument();
  });

  it('Remove invokes onConfirm with the selected scope', async () => {
    const onConfirm = vi.fn();
    const { getByRole } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={3} onConfirm={onConfirm} onCancel={() => {}} />,
    );
    // default selection -> only-this
    await userEvent.click(getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenLastCalledWith('only-this');

    // switch to all-pages then confirm again
    await userEvent.click(getByRole('radio', { name: /All pages/ }));
    await userEvent.click(getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenLastCalledWith('all-pages');
  });

  it('Cancel button invokes onCancel', async () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={2} onConfirm={() => {}} onCancel={onCancel} />,
    );
    await userEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape invokes onCancel', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={2} onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reopening the dialog after a previous "all-pages" choice resets to "only-this"', async () => {
    const { getByRole, rerender } = renderWithTheme(
      <RemoveLinkedCopiesDialog open linkedCount={3} onConfirm={() => {}} onCancel={() => {}} />,
    );
    await userEvent.click(getByRole('radio', { name: /All pages/ }));
    expect((getByRole('radio', { name: /All pages/ }) as HTMLInputElement).checked).toBe(true);

    // close
    rerender(
      <RemoveLinkedCopiesDialog
        open={false}
        linkedCount={3}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    // reopen
    rerender(
      <RemoveLinkedCopiesDialog open linkedCount={3} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect((getByRole('radio', { name: 'Only this page' }) as HTMLInputElement).checked).toBe(true);
  });
});
