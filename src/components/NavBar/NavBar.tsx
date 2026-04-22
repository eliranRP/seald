import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Bell, Search } from 'lucide-react';
import { Avatar } from '../Avatar';
import type { NavBarProps, NavItem } from './NavBar.types';
import {
  DefaultWordmark,
  Header,
  IconButton,
  LogoSlot,
  Nav,
  NavItemButton,
  NavItemLink,
  RightCluster,
  SearchPill,
  Spacer,
} from './NavBar.styles';

const DEFAULT_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'documents', label: 'Documents' },
  { id: 'templates', label: 'Templates' },
  { id: 'signers', label: 'Signers' },
  { id: 'reports', label: 'Reports' },
];

export const NavBar = forwardRef<HTMLElement, NavBarProps>((props, ref) => {
  const {
    logo,
    items = DEFAULT_ITEMS,
    activeItemId = 'documents',
    onSelectItem,
    onSearch,
    onBellClick,
    bellIcon,
    searchIcon,
    user,
    ...rest
  } = props;

  const BellGlyph = bellIcon ?? Bell;
  const SearchGlyph = searchIcon ?? Search;

  const logoNode: ReactNode = logo ?? <DefaultWordmark>Sealed</DefaultWordmark>;

  return (
    <Header {...rest} ref={ref}>
      <LogoSlot>{logoNode}</LogoSlot>
      <Nav aria-label="Primary">
        {items.map((item) => {
          const isActive = item.id === activeItemId;
          const ariaCurrent = isActive ? ('page' as const) : undefined;
          if (item.href !== undefined) {
            return (
              <NavItemLink
                key={item.id}
                href={item.href}
                $active={isActive}
                aria-current={ariaCurrent}
                onClick={() => onSelectItem?.(item.id)}
              >
                {item.label}
              </NavItemLink>
            );
          }
          return (
            <NavItemButton
              key={item.id}
              type="button"
              $active={isActive}
              aria-current={ariaCurrent}
              onClick={() => onSelectItem?.(item.id)}
            >
              {item.label}
            </NavItemButton>
          );
        })}
      </Nav>
      <Spacer />
      <RightCluster>
        <SearchPill type="button" aria-label="Open command palette" onClick={() => onSearch?.()}>
          <SearchGlyph size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>⌘K</span>
        </SearchPill>
        <IconButton type="button" aria-label="Notifications" onClick={() => onBellClick?.()}>
          <BellGlyph size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        {user ? <Avatar name={user.name} size={32} imageUrl={user.avatarUrl} /> : null}
      </RightCluster>
    </Header>
  );
});

NavBar.displayName = 'NavBar';
