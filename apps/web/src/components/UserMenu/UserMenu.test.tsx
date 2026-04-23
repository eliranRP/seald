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
});
