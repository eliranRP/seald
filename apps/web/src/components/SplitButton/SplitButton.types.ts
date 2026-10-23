import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SplitButtonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Main action label, e.g. "Send". */
  readonly label: string;
  readonly icon?: LucideIcon | undefined;
  readonly onMain: () => void;
  /** Opens the options sheet behind the chevron. */
  readonly onOptions: () => void;
  readonly optionsLabel?: string | undefined;
  /** Disables both halves. */
  readonly disabled?: boolean | undefined;
  /** Stretch to the container (mobile bottom bar). */
  readonly fullWidth?: boolean | undefined;
}
