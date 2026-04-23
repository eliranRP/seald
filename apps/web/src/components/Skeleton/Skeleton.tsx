import { forwardRef } from 'react';
import type { SkeletonProps } from './Skeleton.types';
import { SkeletonRoot } from './Skeleton.styles';

/**
 * L1 primitive — visual placeholder for content that hasn't arrived yet.
 * Renders as a shimmering rounded rectangle (`text`), sharper rectangle
 * (`rect`), or pill/avatar circle (`circle`).
 *
 * Carries `role="status"` + `aria-busy` so screen readers announce the
 * pending region, and plays nicely with `prefers-reduced-motion` (the
 * shimmer animation is disabled in that case).
 */
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>((props, ref) => {
  const {
    variant = 'text',
    width,
    height,
    animated = true,
    'aria-label': ariaLabel,
    ...rest
  } = props;
  return (
    <SkeletonRoot
      ref={ref}
      $variant={variant}
      $width={width}
      $height={height}
      $animated={animated}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={ariaLabel ?? 'Loading'}
      {...rest}
    />
  );
});
Skeleton.displayName = 'Skeleton';
