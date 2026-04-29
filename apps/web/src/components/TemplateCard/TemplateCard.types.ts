import type { HTMLAttributes } from 'react';
import type { TemplateSummary } from '@/features/templates';

export interface TemplateCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> {
  readonly template: TemplateSummary;
  readonly onUse: (template: TemplateSummary) => void;
  readonly onEdit?: ((template: TemplateSummary) => void) | undefined;
  /** Optional duplicate handler. Surfaces a "More actions" overflow menu when present. */
  readonly onDuplicate?: ((template: TemplateSummary) => void) | undefined;
  /**
   * Optional delete handler. When supplied, the overflow menu adds a
   * "Delete" item (red, destructive) that opens an inline confirm
   * affordance before invoking the callback. The host page is responsible
   * for the actual removal — for the local-state seed this is a `setState`
   * filter; once the templates API lands it'll be a `DELETE /templates/:id`.
   */
  readonly onDelete?: ((template: TemplateSummary) => void) | undefined;
}
