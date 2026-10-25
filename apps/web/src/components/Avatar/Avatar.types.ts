import type { HTMLAttributes } from 'react';

export type AvatarSize = 24 | 28 | 32 | 36 | 40 | 56 | 64;
/** `neutral` is the canvas `.av-none` grey (same tint as `slate`). */
export type AvatarTone = 'indigo' | 'emerald' | 'amber' | 'danger' | 'slate' | 'neutral';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  readonly name: string;
  readonly size?: AvatarSize | undefined;
  readonly imageUrl?: string | undefined;
  readonly tone?: AvatarTone | undefined;
}
