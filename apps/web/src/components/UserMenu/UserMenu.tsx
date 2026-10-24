import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Menu } from '../Menu';
import type { MenuEntry } from '../Menu';
import type { UserMenuProps } from './UserMenu.types';
import { Email, Name, Root, Trigger } from './UserMenu.styles';

/**
 * L2 component — avatar button that opens the account menu: name + email
 * header, then Settings and Sign out. Download my data, Integrations and
 * Delete account live in Settings. Built on the `Menu` primitive, so it
 * closes on outside click, Escape (focus returns to the avatar) and after
 * an item is picked, and supports arrow-key navigation.
 */
export const UserMenu = forwardRef<HTMLDivElement, UserMenuProps>((props, ref) => {
  const { user, onSignOut, onOpenSettings, ...rest } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const close = useCallback((): void => setOpen(false), []);

  const items: MenuEntry[] = [];
  if (onOpenSettings) {
    items.push({ id: 'settings', label: 'Settings', icon: Settings, onSelect: onOpenSettings });
  }
  items.push({ id: 'signout', label: 'Sign out', icon: LogOut, onSelect: onSignOut });

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
        <Avatar name={user.name} size={36} tone="indigo" imageUrl={user.avatarUrl} />
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
