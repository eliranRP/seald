import type { HTMLAttributes, ReactNode } from 'react';

export interface AuthSplitLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** The centred form column content (title, buttons, fields, ...). */
  readonly children: ReactNode;
  /**
   * Hides the product panel on the right even on wide viewports. The panel
   * is always hidden under 768 px (mobile is form-only).
   */
  readonly hidePanel?: boolean | undefined;
}
