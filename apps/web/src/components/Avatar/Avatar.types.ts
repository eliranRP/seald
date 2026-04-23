import type { HTMLAttributes } from 'react';

export type AvatarSize = 24 | 32 | 40 | 56;
export type AvatarTone = 'indigo' | 'emerald' | 'amber' | 'danger' | 'slate';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  readonly name: string;
  readonly size?: AvatarSize | undefined;
  readonly imageUrl?: string | undefined;
  readonly tone?: AvatarTone | undefined;
}
