import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ResponsiveDialog } from './ResponsiveDialog';

function stubViewport(mobile: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResponsiveDialog', () => {
  it('renders nothing while closed', () => {
    stubViewport(false);
    const { queryByRole } = renderWithTheme(
      <ResponsiveDialog open={false} onClose={vi.fn()} title="Add contacts">
        body
      </ResponsiveDialog>,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('is a named dialog with body and footer on desktop', () => {
    stubViewport(false);
    const { getByRole, getByText } = renderWithTheme(
      <ResponsiveDialog
        open
        onClose={vi.fn()}
        title="Add contacts"
        footer={<button type="button">Add</button>}
        footerStart={<span>3 new</span>}
      >
        <p>the body</p>
      </ResponsiveDialog>,
    );
    expect(getByRole('dialog', { name: 'Add contacts' })).toBeInTheDocument();
    expect(getByText('the body')).toBeInTheDocument();
    expect(getByText('3 new')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('closes from the X button, Escape and the scrim on desktop', () => {
    stubViewport(false);
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(
      <ResponsiveDialog open onClose={onClose} title="Edit contact">
        body
      </ResponsiveDialog>,
    );
    fireEvent.click(getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('clicks inside the card do not close it', () => {
    stubViewport(false);
    const onClose = vi.fn();
    const { getByText } = renderWithTheme(
      <ResponsiveDialog open onClose={onClose} title="Edit contact">
        <p>inside</p>
      </ResponsiveDialog>,
    );
    fireEvent.click(getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is a bottom sheet with the same content on phones', () => {
    stubViewport(true);
    const { getByRole, getByText } = renderWithTheme(
      <ResponsiveDialog
        open
        onClose={vi.fn()}
        title="Add contacts"
        footer={<button type="button">Add</button>}
      >
        <p>the body</p>
      </ResponsiveDialog>,
    );
    expect(getByRole('dialog', { name: 'Add contacts' })).toBeInTheDocument();
    expect(getByText('the body')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    stubViewport(false);
    const { container } = renderWithTheme(
      <ResponsiveDialog open onClose={vi.fn()} title="Add contacts">
        body
      </ResponsiveDialog>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
  it('moves focus in, traps Tab and restores focus to the trigger on desktop', async () => {
    stubViewport(false);
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ResponsiveDialog
            open={open}
            onClose={() => setOpen(false)}
            title="Edit contact"
            footer={<button type="button">Save</button>}
          >
            <input aria-label="Name" />
          </ResponsiveDialog>
        </>
      );
    }
    const { getByRole } = renderWithTheme(<Harness />);
    const trigger = getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    expect(getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await userEvent.tab();
    expect(getByRole('button', { name: 'Save' })).toHaveFocus();
    await userEvent.tab();
    expect(getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(getByRole('button', { name: 'Save' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
