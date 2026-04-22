import type { HTMLAttributes } from 'react';

export type PlacePagesMode = 'this' | 'all' | 'allButLast' | 'last' | 'custom';

export interface PlaceOnPagesPopoverProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly initialMode?: PlacePagesMode | undefined;
  readonly onApply: (mode: PlacePagesMode, customPages?: ReadonlyArray<number>) => void;
  readonly onCancel: () => void;
  readonly title?: string | undefined;
  readonly applyLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
}
