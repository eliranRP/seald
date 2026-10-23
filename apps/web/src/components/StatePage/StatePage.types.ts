import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatePageTone = 'neutral' | 'bad' | 'warn' | 'ok';

export interface StatePageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Round status icon (72px). Ignored when `code` is set. */
  readonly icon?: LucideIcon | undefined;
  readonly tone?: StatePageTone | undefined;
  /** Big quiet numeral instead of an icon (the 404 page). */
  readonly code?: string | undefined;
  readonly title: string;
  /** Short muted line under the title. */
  readonly description?: ReactNode | undefined;
  /** Actions, fields and chips under the copy. */
  readonly children?: ReactNode;
}
