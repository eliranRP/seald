import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Tone drives the dot + pill color of a timeline entry.
 *  - `indigo`  — the sender's own actions (sent, reminded)
 *  - `success` — a signer signed / envelope sealed
 *  - `amber`   — pending action ("still waiting")
 *  - `danger`  — decline / expire / fail
 *  - `slate`   — neutral system events (viewed, created)
 */
export type ActivityTimelineTone = 'indigo' | 'success' | 'amber' | 'danger' | 'slate';

export interface ActivityTimelineEvent {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly tone: ActivityTimelineTone;
  /** Short primary label. */
  readonly text: string;
  /** Who performed the action. Rendered in muted tone. */
  readonly by: string;
  /** Pre-formatted timestamp. `null` reads as "in progress". */
  readonly at: string | null;
  /** Short badge label (e.g. "signed", "viewed"). */
  readonly kind: string;
  /** Optional: pending events pulse + use amber dot. */
  readonly pending?: boolean;
}

export interface ActivityTimelineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly events: ReadonlyArray<ActivityTimelineEvent>;
  /** Stagger delay per event in ms; 0 disables the entry animation. Default 180. */
  readonly staggerMs?: number | undefined;
}
