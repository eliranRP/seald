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

  it('renders Download my data + Delete account when handlers are provided', async () => {
    const onExportData = vi.fn();
    const onDeleteAccount = vi.fn();
    const { getByRole } = renderWithTheme(
      <UserMenu
        user={user}
        onSignOut={() => {}}
        onExportData={onExportData}
        onDeleteAccount={onDeleteAccount}
      />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    await userEvent.click(getByRole('menuitem', { name: /download my data/i }));
    expect(onExportData).toHaveBeenCalledTimes(1);
    // After firing, menu closes; reopen and verify the danger item too.
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    await userEvent.click(getByRole('menuitem', { name: /delete account/i }));
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('does NOT render Download my data / Delete account when handlers are absent', async () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(queryByRole('menuitem', { name: /download my data/i })).toBeNull();
    expect(queryByRole('menuitem', { name: /delete account/i })).toBeNull();
  });

  it('disables and reflects busy state on the export item while isExporting', async () => {
    const onExportData = vi.fn();
    const { getByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} onExportData={onExportData} isExporting />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    const item = getByRole('menuitem', { name: /preparing download/i });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(item);
    expect(onExportData).not.toHaveBeenCalled();
  });

  it('disables and reflects busy state on the delete item while isDeleting', async () => {
    const onDeleteAccount = vi.fn();
    const { getByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} onDeleteAccount={onDeleteAccount} isDeleting />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    const item = getByRole('menuitem', { name: /deleting account/i });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(item);
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });

  // Discoverability: /settings/integrations was added by the Drive-feature work
  // but had no entry in the avatar dropdown — so authed users could not reach
  // it without typing the URL. The gdrive-feature-manager skill forbids new
  // top-level NAV_ITEMS, so the avatar dropdown is the natural home.
  it('renders an Integrations menuitem when onOpenIntegrations is provided', async () => {
    const onOpenIntegrations = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} onOpenIntegrations={onOpenIntegrations} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    await userEvent.click(getByRole('menuitem', { name: /integrations/i }));
    expect(onOpenIntegrations).toHaveBeenCalledTimes(1);
    // Activating an item closes the menu — same contract as Sign out / Export.
    expect(queryByRole('menu')).toBeNull();
  });

  it('does NOT render Integrations when onOpenIntegrations is absent', async () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <UserMenu user={user} onSignOut={() => {}} />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    expect(queryByRole('menuitem', { name: /integrations/i })).toBeNull();
  });
});
