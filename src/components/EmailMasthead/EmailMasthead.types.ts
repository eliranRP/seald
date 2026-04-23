import type { HTMLAttributes, ReactNode } from 'react';

export interface EmailMastheadProps extends HTMLAttributes<HTMLDivElement> {
  readonly brand: string;
  readonly mark?: ReactNode | undefined;
}
