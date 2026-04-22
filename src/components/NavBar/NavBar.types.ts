import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  readonly id: string;
  readonly label: string;
  readonly href?: string | undefined;
};

export type NavBarUser = {
  readonly name: string;
  readonly avatarUrl?: string | undefined;
};

export interface NavBarProps extends HTMLAttributes<HTMLElement> {
  readonly logo?: ReactNode | undefined;
  readonly items?: ReadonlyArray<NavItem> | undefined;
  readonly activeItemId?: string | undefined;
  readonly onSelectItem?: ((id: string) => void) | undefined;
  readonly onSearch?: (() => void) | undefined;
  readonly onBellClick?: (() => void) | undefined;
  readonly bellIcon?: LucideIcon | undefined;
  readonly searchIcon?: LucideIcon | undefined;
  readonly user?: NavBarUser | undefined;
}
