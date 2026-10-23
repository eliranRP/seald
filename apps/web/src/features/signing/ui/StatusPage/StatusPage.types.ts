import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatusTone = 'success' | 'ok' | 'bad' | 'warn' | 'neutral';

export interface StatusPageProps {
  /** `success` is the round check that springs in; the others are tinted icon discs. */
  readonly tone: StatusTone;
  /** Glyph in the disc. Ignored while `busy`. */
  readonly icon: LucideIcon;
  /** A spinner instead of the disc: the page is still working (opening the link). */
  readonly busy?: boolean | undefined;
  readonly title: string;
  /** Meta lines, chips, actions: stacked and centred under the title. */
  readonly children?: ReactNode;
}
