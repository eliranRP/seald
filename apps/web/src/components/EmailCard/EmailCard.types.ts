import type { HTMLAttributes, ReactNode } from 'react';

export interface EmailCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}
