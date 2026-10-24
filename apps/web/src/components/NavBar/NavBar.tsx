import { forwardRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { CircleHelp, FileText, LayoutTemplate, User as UserIcon, Users } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { UserMenu } from '../UserMenu';
import type { NavBarProps, NavItem, NavBarUser } from './NavBar.types';
import {
  DefaultWordmark,
  GhostButton,
  GuestChip,
  Header,
  HelpLink,
  LogoMark,
  LogoSlot,
  Nav,
  NavItemButton,
  NavItemLink,
  PrimaryButton,
  RightCluster,
  Spacer,
} from './NavBar.styles';

/**
 * Fallback nav items when the consumer doesn't pass `items`. Kept in sync
 * with `apps/web/src/layout/navItems.ts:NAV_ITEMS` (Documents · Templates ·
 * Contacts). "New document" is the Documents page's primary button, not a
 * tab.
 *
 * Adding a new top-level destination?
 *   1. Add it to NAV_ITEMS in apps/web/src/layout/navItems.ts.
 *   2. Mirror it here.
 *   3. Update matchNavId() so the active-tab indicator follows the route.
 */
const DEFAULT_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'signers', label: 'Contacts', icon: Users },
];

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

interface RightClusterArgs {
  readonly isGuest: boolean;
  readonly user: NavBarUser | undefined;
  readonly onSignIn: (() => void) | undefined;
  readonly onSignUp: (() => void) | undefined;
  readonly onSignOut: (() => void) | undefined;
  readonly onOpenSettings: (() => void) | undefined;
}

function renderRightCluster(args: RightClusterArgs): ReactNode {
  const { isGuest, user, onSignIn, onSignUp, onSignOut, onOpenSettings } = args;
  if (isGuest) {
    return (
      <>
        <GhostButton type="button" onClick={onSignIn}>
          Sign in
        </GhostButton>
        <PrimaryButton type="button" onClick={onSignUp}>
          Sign up
        </PrimaryButton>
      </>
    );
  }
  if (!user) return null;
  // When a sign-out handler is provided (the common authed case in the real
  // app) render the full account menu; otherwise fall back to a plain avatar
  // so Storybook / static usages still render cleanly.
  if (onSignOut) {
    return (
      <UserMenu
        user={{
          name: user.name,
          email: user.email ?? '',
          ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        }}
        onSignOut={onSignOut}
        {...(onOpenSettings ? { onOpenSettings } : {})}
      />
    );
  }
  return <Avatar name={user.name} size={36} tone="indigo" imageUrl={user.avatarUrl} />;
}

/**
 * L3 widget — the app's top bar (canvas `.topnav`): "S" mark + Seald
 * wordmark, icon nav links, then Help and the account menu on the right.
 * With `compact` (AppShell sets it at ≤640px) it is the mobile top bar
 * (`.m-top`): logo + right cluster only — the destinations move to the
 * bottom `MobileNav`. A CSS media query does the same before hydration.
 */
export const NavBar = forwardRef<HTMLElement, NavBarProps>((props, ref) => {
  const {
    logo,
    items = DEFAULT_ITEMS,
    activeItemId = 'documents',
    onSelectItem,
    user,
    mode = 'authed',
    onSignIn,
    onSignUp,
    onSignOut,
    onOpenSettings,
    helpHref,
    compact = false,
    rightSlot,
    ...rest
  } = props;

  const logoNode: ReactNode = logo ?? (
    <>
      <LogoMark aria-hidden>S</LogoMark>
      <DefaultWordmark>Seald</DefaultWordmark>
    </>
  );

  const isGuest = mode === 'guest';

  return (
    <Header {...rest} ref={ref}>
      <LogoSlot>{logoNode}</LogoSlot>
      {isGuest ? (
        <GuestChip aria-label="Guest mode">
          <Icon icon={UserIcon} size={12} />
          <span>Guest mode</span>
        </GuestChip>
      ) : null}
      {!isGuest && !compact ? (
        <Nav aria-label="Primary">
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            const ariaCurrent = isActive ? ('page' as const) : undefined;
            const glyph = item.icon ? <Icon icon={item.icon} size={16} /> : null;
            if (item.href !== undefined) {
              return (
                <NavItemLink
                  key={item.id}
                  href={item.href}
                  aria-current={ariaCurrent}
                  onClick={(event) => {
                    if (!onSelectItem || !isPlainClick(event)) return;
                    event.preventDefault();
                    onSelectItem(item.id);
                  }}
                >
                  {glyph}
                  {item.label}
                </NavItemLink>
              );
            }
            return (
              <NavItemButton
                key={item.id}
                type="button"
                aria-current={ariaCurrent}
                onClick={() => onSelectItem?.(item.id)}
              >
                {glyph}
                {item.label}
              </NavItemButton>
            );
          })}
        </Nav>
      ) : null}
      <Spacer />
      <RightCluster>
        {isGuest ? null : rightSlot}
        {!isGuest && !compact && helpHref ? (
          <HelpLink href={helpHref} aria-label="Help">
            <Icon icon={CircleHelp} size={20} />
          </HelpLink>
        ) : null}
        {renderRightCluster({
          isGuest,
          user,
          onSignIn,
          onSignUp,
          onSignOut,
          onOpenSettings,
        })}
      </RightCluster>
    </Header>
  );
});

NavBar.displayName = 'NavBar';
