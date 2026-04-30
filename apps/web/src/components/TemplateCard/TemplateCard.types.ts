import type { HTMLAttributes } from 'react';
import type { TemplateSummary } from '@/features/templates';

/**
 * Cover thumbnail accent. Picks from a small set of soft palettes so
 * the grid reads as a varied stack of templates without committing to
 * a per-template colour-picker UI yet. Mirrors the design guide's
 * `ACCENTS` map (`indigo` / `amber` / `emerald` / `pink`).
 */
export type TemplateCardAccent = 'indigo' | 'amber' | 'emerald' | 'pink';

export interface TemplateCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> {
  readonly template: TemplateSummary;
  readonly onUse: (template: TemplateSummary) => void;
  readonly onEdit?: ((template: TemplateSummary) => void) | undefined;
  /** Optional duplicate handler. Surfaces a "More actions" overflow menu when present. */
  readonly onDuplicate?: ((template: TemplateSummary) => void) | undefined;
  /**
   * Optional delete handler. When supplied, the hover-action overlay
   * adds a Delete affordance (red trash). The host page owns the
   * confirmation surface — this card only exposes the trigger so the
   * confirm modal can sit at page level (matches the design guide's
   * centered modal rather than a per-card popover).
   */
  readonly onDelete?: ((template: TemplateSummary) => void) | undefined;
  /**
   * Click on a tag pill in the card body. The page uses this to add
   * the tag to the active filter so users can pivot from a card into
   * a filtered grid.
   */
  readonly onTagClick?: ((tag: string) => void) | undefined;
  /**
   * Open the tag editor popover anchored to this card. The page
   * decides where to render the popover; the card just lifts the
   * intent. When omitted, no Tags affordance is rendered in the
   * hover overlay.
   */
  readonly onEditTags?: ((template: TemplateSummary) => void) | undefined;
}
