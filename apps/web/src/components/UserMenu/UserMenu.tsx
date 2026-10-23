import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import { Download, LogOut, Puzzle, Settings, Trash2 } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Menu } from '../Menu';
import type { MenuEntry } from '../Menu';
import type { UserMenuProps } from './UserMenu.types';
import { Email, Name, Root, Trigger } from './UserMenu.styles';

/**
 * L2 component — avatar button that opens the account menu: name + email
 * header, then Settings, Download my data, Integrations (flagged), Sign out
 * and the danger "Delete account". Built on the `Menu` primitive, so it
 * closes on outside click, Escape (focus returns to the avatar) and after
 * an item is picked, and supports arrow-key navigation.
 */
export const UserMenu = forwardRef<HTMLDivElement, UserMenuProps>((props, ref) => {
  const {
    user,
    onSignOut,
    onOpenSettings,
    onExportData,
    onDeleteAccount,
    onOpenIntegrations,
    isExporting = false,
    isDeleting = false,
    ...rest
  } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const close = useCallback((): void => setOpen(false), []);

  const items: MenuEntry[] = [];
  if (onOpenSettings) {
    items.push({ id: 'settings', label: 'Settings', icon: Settings, onSelect: onOpenSettings });
  }
  if (onExportData) {
    items.push({
      id: 'export',
      label: isExporting ? 'Preparing download…' : 'Download my data',
      icon: Download,
      busy: isExporting,
      onSelect: onExportData,
    });
  }
  if (onOpenIntegrations) {
    items.push({
      id: 'integrations',
      label: 'Integrations',
      icon: Puzzle,
      onSelect: onOpenIntegrations,
    });
  }
  items.push({ id: 'signout', label: 'Sign out', icon: LogOut, onSelect: onSignOut });
  if (onDeleteAccount) {
    items.push({ type: 'separator', id: 'sep-danger' });
    items.push({
      id: 'delete',
      label: isDeleting ? 'Deleting account…' : 'Delete account',
      icon: Trash2,
      danger: true,
      busy: isDeleting,
      onSelect: onDeleteAccount,
    });
  }

  return (
    <Root ref={ref} {...rest}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Open menu for ${user.name}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Avatar name={user.name} size={32} imageUrl={user.avatarUrl} />
      </Trigger>
      <Menu
        id={menuId}
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        aria-label={`Account menu for ${user.name}`}
        header={
          <>
            <Name>{user.name}</Name>
            <Email>{user.email}</Email>
          </>
        }
        items={items}
      />
    </Root>
  );
});
UserMenu.displayName = 'UserMenu';
