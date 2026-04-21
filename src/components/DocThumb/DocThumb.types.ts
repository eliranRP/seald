import type { HTMLAttributes } from 'react';

export type DocThumbSize = 40 | 52 | 72;

export interface DocThumbProps extends HTMLAttributes<HTMLDivElement> {
  readonly title: string;
  readonly size?: DocThumbSize | undefined;
  readonly signed?: boolean | undefined;
}
