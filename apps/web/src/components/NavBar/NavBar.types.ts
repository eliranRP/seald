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
  /** Optional — wires the UserMenu's "Download my data" item. */
  readonly onExportData?: (() => void) | undefined;
  /** Optional — wires the UserMenu's "Delete account" danger item. */
  readonly onDeleteAccount?: (() => void) | undefined;
  /**
   * Optional — wires the UserMenu's "Integrations" item that navigates
   * to /settings/integrations (Google Drive feature). Pass `undefined`
   * to hide the item (e.g. when the feature flag is off, or in guest
   * mode).
   */
  readonly onOpenIntegrations?: (() => void) | undefined;
  /** Mirrors UserMenu.isExporting; disables the item while in flight. */
  readonly isExporting?: boolean | undefined;
  /** Mirrors UserMenu.isDeleting; disables the item while in flight. */
  readonly isDeleting?: boolean | undefined;
}
