import type { HTMLAttributes } from 'react';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Shape: `text` (rounded rectangle, default), `rect` (sharp corners),
   * `circle` (pill / avatar-shaped — forces `width === height`).
   */
  readonly variant?: SkeletonVariant | undefined;
  /** CSS length, number → px. Defaults to 100% so it fills its parent. */
  readonly width?: number | string | undefined;
  /** CSS length, number → px. Defaults to 14px for text, 1em otherwise. */
  readonly height?: number | string | undefined;
  /** Disables the shimmer animation (useful for snapshot / reduced-motion). */
  readonly animated?: boolean | undefined;
}
