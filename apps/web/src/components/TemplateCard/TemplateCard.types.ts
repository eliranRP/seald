import type { HTMLAttributes } from 'react';
import type { TemplateSummary } from '@/features/templates';

export interface TemplateCardActions {
  /** Menu "Edit": opens the template in the editor. */
  readonly onEdit?: ((template: TemplateSummary) => void) | undefined;
  readonly onDuplicate?: ((template: TemplateSummary) => void) | undefined;
  /** Menu "Tags": the host shows its tag editor. */
  readonly onEditTags?: ((template: TemplateSummary) => void) | undefined;
  /**
   * The host confirms before deleting; the card only lifts the intent.
   * Last item of the menu, in red.
   */
  readonly onDelete?: ((template: TemplateSummary) => void) | undefined;
  /**
   * WP-36: open bulk send (one envelope per CSV row). The host passes it only
   * while `bulkSend` is on and the template has a saved document.
   */
  readonly onBulkSend?: ((template: TemplateSummary) => void) | undefined;
  /** WP-37: open the template's direct-link settings (flag `directLinks`). */
  readonly onDirectLink?: ((template: TemplateSummary) => void) | undefined;
}

export interface TemplateCardProps
  extends TemplateCardActions, Omit<HTMLAttributes<HTMLDivElement>, 'onClick' | 'children'> {
  readonly template: TemplateSummary;
  /** The whole card is this action ("Use"). */
  readonly onUse: (template: TemplateSummary) => void;
  /**
   * Phone layout: a row (small thumbnail, name, meta, ⋯) instead of a tile.
   * The ⋯ then calls `onMore` (the host opens a sheet) instead of a menu.
   */
  readonly compact?: boolean | undefined;
  readonly onMore?: ((template: TemplateSummary) => void) | undefined;
}
