import type { HTMLAttributes } from 'react';

/**
 * Props for the editorial auth-page left-side panel.
 *
 * Intentionally empty for now — the panel is fully self-contained (brand,
 * headline, testimonial, and trust footer are all hardcoded to match the
 * design). Consumers can still forward standard HTML attributes (e.g.
 * `className`, `aria-label`) via spread.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AuthBrandPanelProps extends HTMLAttributes<HTMLElement> {
  // Intentionally empty — fully self-contained for now.
}
