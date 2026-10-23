import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SourceTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: LucideIcon | ReactNode;
  readonly label: string;
  /** One-word hint under the label, e.g. "PDF, Word". */
  readonly meta?: string | undefined;
  readonly selected?: boolean | undefined;
  /** Icon above the label (phones). */
  readonly stacked?: boolean | undefined;
  /** A one-off action (e.g. "Connect Google Drive"): a plain button, not a radio. */
  readonly action?: boolean | undefined;
}
