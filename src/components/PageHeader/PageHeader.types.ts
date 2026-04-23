import type { HTMLAttributes, ReactNode } from 'react';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly eyebrow?: string | undefined;
  readonly title: ReactNode;
  readonly actions?: ReactNode | undefined;
}
