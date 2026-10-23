import type { ReactNode } from 'react';

export interface DisclosureProps {
  /** Visible label. Pages use "Advanced". */
  readonly label: string;
  /** Accessible name when several toggles share a page. Must start with `label`. */
  readonly ariaLabel?: string | undefined;
  readonly children: ReactNode;
}
