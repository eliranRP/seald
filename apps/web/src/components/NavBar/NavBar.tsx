import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { User as UserIcon } from 'lucide-react';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { UserMenu } from '../UserMenu';
import type { NavBarProps, NavItem, NavBarUser } from './NavBar.types';
import {
  DefaultWordmark,
  GhostButton,
  GuestChip,
  Header,
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
 * with `apps/web/src/layout/navItems.ts:NAV_ITEMS` so any route that
 * forgets to plumb the items prop (e.g. UploadPage / DocumentPage render
 * their own NavBar outside AppShell) still surfaces every tab.
 *
 * Adding a new top-level destination?
 *   1. Add it to NAV_ITEMS in apps/web/src/layout/navItems.ts.
 *   2. Mirror it here.
 *   3. Update matchNavId() so the active-tab indicator follows the route.
 */
const DEFAULT_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'documents', label: 'Documents' },
  { id: 'sign', label: 'Sign' },
  { id: 'templates', label: 'Templates' },
  { id: 'signers', label: 'Signers' },
];

interface RightClusterArgs {
  readonly isGuest: boolean;
  readonly user: NavBarUser | undefined;
  readonly onSignIn: (() => void) | undefined;
  readonly onSignUp: (() => void) | undefined;
  readonly onSignOut: (() => void) | undefined;
  readonly onExportData: (() => void) | undefined;
  readonly onDeleteAccount: (() => void) | undefined;
  readonly isExporting: boolean;
  readonly isDeleting: boolean;
}

function renderRightCluster(args: RightClusterArgs): ReactNode {
  const {
    isGuest,
    user,
    onSignIn,
    onSignUp,
    onSignOut,
    onExportData,
    onDeleteAccount,
    isExporting,
    isDeleting,
  } = args;
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
  // app) render the full popover menu; otherwise fall back to a plain avatar
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
        {...(onExportData ? { onExportData } : {})}
        {...(onDeleteAccount ? { onDeleteAccount } : {})}
        isExporting={isExporting}
        isDeleting={isDeleting}
      />
    );
  }
  return <Avatar name={user.name} size={32} imageUrl={user.avatarUrl} />;
}

/**
 * The Sealed quill/seal mark. Inlined (rather than imported as an SVG asset) so
 * it inherits `color: currentColor` and travels with the component in any
 * Storybook/test environment without needing an asset pipeline.
 */
function SealedMark(): ReactNode {
  return (
    <svg viewBox="0 0 40 40" width="18" height="18" fill="none" aria-hidden="true">
      <g transform="translate(6, 6)">
        <path
          d="M2 22 C 6 20, 10 14, 14 12 L 22 4 L 26 8 L 18 16 C 16 20, 10 24, 4 26 Z"
          fill="currentColor"
        />
        <path
          d="M22 4 L 24 2 C 25 1, 26.5 1, 27.5 2 L 28 2.5 C 29 3.5, 29 5, 28 6 L 26 8 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M0 28 C 8 26, 18 26, 28 28"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

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
    onExportData,
    onDeleteAccount,
    isExporting = false,
    isDeleting = false,
    ...rest
  } = props;

  const logoNode: ReactNode = logo ?? (
    <>
      <LogoMark>
        <SealedMark />
      </LogoMark>
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
      ) : (
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
      )}
      <Spacer />
      <RightCluster>
        {renderRightCluster({
          isGuest,
          user,
          onSignIn,
          onSignUp,
          onSignOut,
          onExportData,
          onDeleteAccount,
          isExporting,
          isDeleting,
        })}
      </RightCluster>
    </Header>
  );
});

NavBar.displayName = 'NavBar';
