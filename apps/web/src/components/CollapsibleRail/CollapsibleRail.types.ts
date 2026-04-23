import type { HTMLAttributes, ReactNode } from 'react';

export type CollapsibleRailSide = 'left' | 'right';

export interface CollapsibleRailProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly side: CollapsibleRailSide;
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly width: number;
  readonly onWidthChange: (next: number) => void;
  readonly minW?: number | undefined;
  readonly maxW?: number | undefined;
  readonly noPad?: boolean | undefined;
  readonly children?: ReactNode | undefined;
}
