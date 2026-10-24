import type { HTMLAttributes, ReactNode } from 'react';
import type { SealdTheme } from '@/styles/theme';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly elevated?: boolean | undefined;
  readonly padding?: keyof SealdTheme['space'] | undefined;
  /**
   * Clickable card (template tile, choice card): lifts 2px with a medium
   * shadow on hover (motion `hoverLift`). Purely visual — put the actual
   * link / button inside, or pass `onClick` + `role` + `tabIndex`.
   */
  readonly interactive?: boolean | undefined;
  readonly children: ReactNode;
}
