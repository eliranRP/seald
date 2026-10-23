import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type BannerTone = 'info' | 'ok' | 'error';

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  /** info (indigo, default) · ok (emerald) · error (red, announced assertively). */
  readonly tone?: BannerTone | undefined;
  /** Leading icon. Defaults per tone; pass `null` for none. */
  readonly icon?: LucideIcon | null | undefined;
  /** Optional trailing action (e.g. a small ghost Button). */
  readonly action?: ReactNode | undefined;
  readonly children: ReactNode;
}
