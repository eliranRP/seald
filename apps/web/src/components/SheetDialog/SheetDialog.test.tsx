import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SheetDialog } from './SheetDialog';

describe('SheetDialog', () => {
  it('renders nothing while closed', () => {
    const { queryByRole } = renderWithTheme(
      <SheetDialog open={false} onClose={() => {}} title="Your signature">
        body
      </SheetDialog>,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('names the dialog, shows body and footer, and has no axe violations', async () => {
    const { getByRole, getByText, container } = renderWithTheme(
      <SheetDialog open onClose={() => {}} title="Your signature" footer={<button>Sign</button>}>
        <p>body text</p>
      </SheetDialog>,
    );
    expect(getByRole('dialog', { name: 'Your signature' })).toBeInTheDocument();
    expect(getByText('body text')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('closes from the close button, the scrim and Escape, but not from a click inside', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithTheme(
      <SheetDialog open onClose={onClose} title="Decline to sign?" closeLabel="Close">
        <p>inside</p>
      </SheetDialog>,
    );
    await user.click(getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
