import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 72px indigo circle art above the title (canvas `.empty-art`). */
  readonly icon?: LucideIcon | undefined;
  /** Serif headline ("No documents yet"). */
  readonly title?: ReactNode | undefined;
  /** The one action (usually a primary Button). */
  readonly action?: ReactNode | undefined;
  /**
   * Optional muted line under the title. The v2 design prefers no
   * paragraph — keep it short when you need one.
   */
  readonly children?: ReactNode;
}
