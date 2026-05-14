import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Title-size variant. `lg` (default) is the kit-standard 48 px H1 used
 * by EnvelopeDetailPage and other detail surfaces; `md` is the smaller
 * 36 px H1 the Dashboard uses so the masthead doesn't dominate the
 * stat-tile row.
 */
export type PageHeaderSize = 'lg' | 'md';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly eyebrow?: string | undefined;
  readonly title: ReactNode;
  readonly actions?: ReactNode | undefined;
  readonly size?: PageHeaderSize | undefined;
}
