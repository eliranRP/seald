import type { HTMLAttributes, ReactNode } from 'react';
import type { SealdTheme } from '@/styles/theme';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly elevated?: boolean | undefined;
  readonly padding?: keyof SealdTheme['space'] | undefined;
  readonly children: ReactNode;
}
