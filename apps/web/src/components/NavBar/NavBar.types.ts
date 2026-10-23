import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  readonly id: string;
  readonly label: string;
  /** When set the item is a link; plain clicks are routed via onSelectItem. */
  readonly href?: string | undefined;
  /** 16px leading icon (canvas `.navlink .ic`). */
  readonly icon?: LucideIcon | undefined;
};

export type NavBarUser = {
  readonly name: string;
  readonly email?: string | undefined;
  readonly avatarUrl?: string | undefined;
};

export type NavBarMode = 'authed' | 'guest';

export interface NavBarProps extends HTMLAttributes<HTMLElement> {
  readonly logo?: ReactNode | undefined;
  readonly items?: ReadonlyArray<NavItem> | undefined;
  readonly activeItemId?: string | undefined;
  readonly onSelectItem?: ((id: string) => void) | undefined;
  readonly user?: NavBarUser | undefined;
  /**
   * `authed` (default) renders nav items + avatar. `guest` hides nav items and
   * renders a "Guest mode" chip plus Sign in / Sign up buttons on the right.
   */
  readonly mode?: NavBarMode | undefined;
  readonly onSignIn?: (() => void) | undefined;
  readonly onSignUp?: (() => void) | undefined;
  readonly onSignOut?: (() => void) | undefined;
  /** Optional — wires the account menu's first item, "Settings". */
  readonly onOpenSettings?: (() => void) | undefined;
  /** Optional — renders the ghost Help icon link before the avatar. */
  readonly helpHref?: string | undefined;
  /**
   * Mobile top bar (`.m-top`): no nav items, no Help — destinations live in
   * the bottom MobileNav. AppShell sets it at ≤640px.
   */
  readonly compact?: boolean | undefined;
  /**
   * Optional — rendered before the user menu in the right cluster (the
   * approvals bell, WP-22). Hidden in guest mode.
   */
  readonly rightSlot?: ReactNode | undefined;
}
