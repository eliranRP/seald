import type { HTMLAttributes, ReactNode } from 'react';

export type NavItem = {
  readonly id: string;
  readonly label: string;
  readonly href?: string | undefined;
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
}
