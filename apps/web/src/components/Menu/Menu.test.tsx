import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Copy, Eye, Trash2 } from 'lucide-react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Menu, MenuButton } from './Menu';
import type { MenuEntry } from './Menu.types';

function buildItems(overrides: { onOpen?: () => void; onDelete?: () => void } = {}) {
  const items: MenuEntry[] = [
    { type: 'label', id: 'l', label: 'Actions' },
    { id: 'open', label: 'Open', icon: Eye, onSelect: overrides.onOpen ?? vi.fn() },
    { id: 'dup', label: 'Duplicate', icon: Copy, onSelect: vi.fn(), disabled: true },
    { id: 'copy', label: 'Copy link', onSelect: vi.fn() },
    { type: 'separator', id: 's' },
    {
      id: 'del',
      label: 'Cancel request',
      icon: Trash2,
      danger: true,
      onSelect: overrides.onDelete ?? vi.fn(),
    },
  ];
  return items;
}

function renderButton(items: MenuEntry[] = buildItems()) {
  return renderWithTheme(
    <MenuButton
      aria-label="More actions for NDA.pdf"
      items={items}
      trigger={(p) => (
        <button type="button" {...p}>
          More
        </button>
      )}
    />,
  );
}

describe('MenuButton + Menu', () => {
  it('wires aria-haspopup / aria-expanded and opens a named menu', async () => {
    const { getByRole, queryByRole } = renderButton();
    const trigger = getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(queryByRole('menu')).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = getByRole('menu', { name: 'More actions for NDA.pdf' });
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
  });

  it('focuses the first enabled item and cycles with arrows, skipping disabled', async () => {
    const { getByRole } = renderButton();
    await userEvent.click(getByRole('button', { name: 'More' }));
    expect(getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(getByRole('menuitem', { name: 'Copy link' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(getByRole('menuitem', { name: 'Cancel request' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(getByRole('menuitem', { name: 'Cancel request' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(getByRole('menuitem', { name: 'Cancel request' })).toHaveFocus();
  });

  it('runs onSelect, closes and returns focus to the trigger', async () => {
    const onDelete = vi.fn();
    const { getByRole, queryByRole } = renderButton(buildItems({ onDelete }));
    await userEvent.click(getByRole('button', { name: 'More' }));
    await userEvent.click(getByRole('menuitem', { name: 'Cancel request' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(queryByRole('menu')).toBeNull();
    expect(getByRole('button', { name: 'More' })).toHaveFocus();
  });

  it('closes on Escape and returns focus', async () => {
    const { getByRole, queryByRole } = renderButton();
    await userEvent.click(getByRole('button', { name: 'More' }));
    await userEvent.keyboard('{Escape}');
    expect(queryByRole('menu')).toBeNull();
    expect(getByRole('button', { name: 'More' })).toHaveFocus();
  });

  it('closes on an outside click but not on a trigger click race', async () => {
    const { getByRole, queryByRole, getByText } = renderWithTheme(
      <div>
        <p>Outside</p>
        <MenuButton
          aria-label="Menu"
          items={buildItems()}
          trigger={(p) => (
            <button type="button" {...p}>
              More
            </button>
          )}
        />
      </div>,
    );
    await userEvent.click(getByRole('button', { name: 'More' }));
    expect(getByRole('menu')).toBeInTheDocument();
    await userEvent.click(getByText('Outside'));
    expect(queryByRole('menu')).toBeNull();
    // Toggling via the trigger re-opens then closes.
    await userEvent.click(getByRole('button', { name: 'More' }));
    await userEvent.click(getByRole('button', { name: 'More' }));
    expect(queryByRole('menu')).toBeNull();
  });

  it('does not fire disabled or busy items', async () => {
    const onSelect = vi.fn();
    const { getByRole } = renderWithTheme(
      <Menu
        open
        onClose={vi.fn()}
        aria-label="Account"
        items={[{ id: 'x', label: 'Preparing…', busy: true, onSelect }]}
      />,
    );
    const item = getByRole('menuitem', { name: 'Preparing…' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders checked items as menuitemradio', () => {
    const { getByRole } = renderWithTheme(
      <Menu
        open
        onClose={vi.fn()}
        aria-label="Updated"
        items={[
          { id: 'any', label: 'Any time', checked: true, onSelect: vi.fn() },
          { id: '7', label: 'Last 7 days', checked: false, onSelect: vi.fn() },
        ]}
      />,
    );
    expect(getByRole('menuitemradio', { name: 'Any time' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(getByRole('menuitemradio', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('closes with reason "tab" on Tab', async () => {
    const onClose = vi.fn();
    renderWithTheme(<Menu open onClose={onClose} aria-label="M" items={buildItems()} />);
    await userEvent.tab();
    expect(onClose).toHaveBeenCalledWith('tab');
  });

  it('has no axe violations when open', async () => {
    const { container, getByRole } = renderButton();
    await userEvent.click(getByRole('button', { name: 'More' }));
    expect(await axe(container)).toHaveNoViolations();
  });
  it('opens below by default and above when placement="top"', () => {
    const { getByRole, rerender } = renderWithTheme(
      <Menu open onClose={vi.fn()} items={buildItems()} aria-label="Actions" />,
    );
    expect(getByRole('menu')).toHaveAttribute('data-placement', 'bottom');
    rerender(
      <Menu open onClose={vi.fn()} items={buildItems()} aria-label="Actions" placement="top" />,
    );
    expect(getByRole('menu')).toHaveAttribute('data-placement', 'top');
  });
});
