import type { HTMLAttributes } from 'react';

/** done = happened · now = current / waiting · bad = failed (declined, bounced) · off = will not happen. */
export type MiniTrackState = 'done' | 'now' | 'bad' | 'off' | 'todo';

export interface MiniTrackStep {
  readonly label: string;
  readonly state: MiniTrackState;
}

export interface MiniTrackProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  /** Usually three steps: Sent → Opened → Signed. */
  readonly steps: ReadonlyArray<MiniTrackStep>;
  /** Names the track, e.g. "Progress for Maya Chen". */
  readonly 'aria-label': string;
}
