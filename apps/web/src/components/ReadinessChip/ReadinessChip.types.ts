import type { ButtonHTMLAttributes } from 'react';

export interface ReadinessChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** Number of things blocking the send. 0 means ready. */
  readonly issues: number;
  /** True while the issue list this chip opens is showing. */
  readonly expanded?: boolean | undefined;
}
