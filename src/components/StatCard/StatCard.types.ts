import type { HTMLAttributes } from 'react';
import type { BadgeTone } from '../Badge/Badge.types';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: string;
  readonly value: string;
  readonly tone: BadgeTone;
}
