import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { UserMenu } from './UserMenu';

const user = { name: 'Jamie Okonkwo', email: 'jamie@seald.app' };

describe('UserMenu', () => {
  it('renders the avatar trigger and keeps the menu closed by default', () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} />,
    );
    expect(getByRole('button', { name: /open menu for jamie okonkwo/i })).toBeInTheDocument();
    expect(queryByRole('menu')).toBeNull();
  });

  it('opens the menu on click and shows name + email + Sign out', async () => {
    const { getByRole } = renderWithTheme(<UserMenu user={user} onSignOut={() => {}} />);
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    const menu = getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveTextContent('Jamie Okonkwo');
    expect(menu).toHaveTextContent('jamie@seald.app');
    expect(getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls onSignOut and closes the menu when Sign out is activated', async () => {
    const onSignOut = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={onSignOut} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    await userEvent.click(getByRole('menuitem', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(queryByRole('menu')).toBeNull();
  });

  it('Escape closes the menu', async () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(queryByRole('menu')).toBeNull();
  });

  it('axe clean in both open and closed states', async () => {
    const { container, getByRole } = renderWithTheme(<UserMenu user={user} onSignOut={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no Download my data, Integrations or Delete account items: they live in Settings', async () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} onOpenSettings={() => {}} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(queryByRole('menuitem', { name: /download my data/i })).toBeNull();
    expect(queryByRole('menuitem', { name: /integrations/i })).toBeNull();
    expect(queryByRole('menuitem', { name: /delete account/i })).toBeNull();
  });

  it('lists Settings first when onOpenSettings is provided, then Sign out', async () => {
    const onOpenSettings = vi.fn();
    const { getByRole, getAllByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} onOpenSettings={onOpenSettings} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Settings', 'Sign out']);
    // Opening focuses the first item for keyboard users.
    expect(getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
    await userEvent.click(getByRole('menuitem', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(queryByRole('menu')).toBeNull();
  });

  it('returns focus to the avatar after Escape', async () => {
    const { getByRole } = renderWithTheme(<UserMenu user={user} onSignOut={() => {}} />);
    const trigger = getByRole('button', { name: /open menu for/i });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
