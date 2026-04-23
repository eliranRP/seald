import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../Avatar';
import type { UserMenuProps } from './UserMenu.types';
import { Email, Header, Item, Menu, Name, Root, Trigger } from './UserMenu.styles';

/**
 * L2 component — avatar button that opens a popover with the user's name,
 * email, and a Sign out action. Closes on outside click, Escape, and after
 * the user picks an item. The NavBar renders this in the `authed` variant of
 * its right cluster.
 */
export const UserMenu = forwardRef<HTMLDivElement, UserMenuProps>((props, ref) => {
  const { user, onSignOut, ...rest } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = useCallback((): void => {
    setOpen(false);
    onSignOut();
  }, [onSignOut]);

  // Forward the external ref to the wrapper, but keep the internal ref for
  // outside-click detection.
  // eslint-disable-next-line no-param-reassign -- ref forwarding idiom.
  const setRoot = useCallback(
    (node: HTMLDivElement | null): void => {
      (rootRef as { current: HTMLDivElement | null }).current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        // eslint-disable-next-line no-param-reassign -- ref forwarding idiom.
        (ref as { current: HTMLDivElement | null }).current = node;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Root ref={setRoot} {...rest}>
      <Trigger
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Open menu for ${user.name}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Avatar name={user.name} size={32} imageUrl={user.avatarUrl} />
      </Trigger>
      {open ? (
        <Menu role="menu">
          <Header>
            <Name>{user.name}</Name>
            <Email>{user.email}</Email>
          </Header>
          <Item type="button" role="menuitem" onClick={handleSignOut}>
            Sign out
          </Item>
        </Menu>
      ) : null}
    </Root>
  );
});
UserMenu.displayName = 'UserMenu';
