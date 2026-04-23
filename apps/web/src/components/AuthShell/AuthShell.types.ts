import type { HTMLAttributes, ReactNode } from 'react';

export interface AuthShellProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  /**
   * When true, hides the brand panel even on wide viewports. Useful for
   * narrow-focus pages like the post-forgot "check your email" screen where
   * the editorial chrome would distract.
   */
  readonly compact?: boolean | undefined;
}
