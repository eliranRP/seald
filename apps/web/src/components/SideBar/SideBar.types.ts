import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SideBarNavItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly count?: number | undefined;
};

export type SideBarFolder = {
  readonly id: string;
  readonly label: string;
};

export type SideBarPrimaryAction = {
  readonly label: string;
  readonly onClick: () => void;
  readonly icon?: LucideIcon | undefined;
};

export interface SideBarProps extends HTMLAttributes<HTMLElement> {
  readonly items?: ReadonlyArray<SideBarNavItem> | undefined;
  readonly activeItemId?: string | undefined;
  readonly onSelectItem?: ((id: string) => void) | undefined;
  readonly folders?: ReadonlyArray<SideBarFolder> | undefined;
  readonly activeFolderId?: string | undefined;
  readonly onSelectFolder?: ((id: string) => void) | undefined;
  readonly primaryAction?: SideBarPrimaryAction | undefined;
}
