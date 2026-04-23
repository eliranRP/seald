import type { HTMLAttributes } from 'react';

export interface FilterTabItem {
  readonly id: string;
  readonly label: string;
  readonly count?: number | undefined;
}

export interface FilterTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly items: ReadonlyArray<FilterTabItem>;
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}
