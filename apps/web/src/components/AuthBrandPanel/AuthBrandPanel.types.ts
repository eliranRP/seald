import type { HTMLAttributes } from 'react';

/**
 * Props for the editorial auth-page left-side panel.
 *
 * Intentionally empty for now — the panel is fully self-contained (brand,
 * headline, testimonial, and trust footer are all hardcoded to match the
 * design). Consumers can still forward standard HTML attributes (e.g.
 * `className`, `aria-label`) via spread.
 */
export type AuthBrandPanelProps = HTMLAttributes<HTMLElement>;
