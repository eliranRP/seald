import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentedOption<T extends string = string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly icon?: LucideIcon | undefined;
  readonly disabled?: boolean | undefined;
}

export interface SegmentedControlProps<T extends string = string> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'role'
> {
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Required — names the radio group for assistive tech. */
  readonly 'aria-label': string;
  /** Stretch to the container width, segments share it equally. */
  readonly block?: boolean | undefined;
  /** Icon above label, 56px tall (mobile pickers). */
  readonly stacked?: boolean | undefined;
  /** `lg`: 44px segments (52px control), the phone touch height. */
  readonly size?: 'md' | 'lg' | undefined;
}
