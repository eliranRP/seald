import type { HTMLAttributes } from 'react';
import type { TemplateSummary } from '@/features/templates';

export interface TemplateCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> {
  readonly template: TemplateSummary;
  readonly onUse: (template: TemplateSummary) => void;
  readonly onEdit?: ((template: TemplateSummary) => void) | undefined;
  /** Optional duplicate handler. Surfaces a "More actions" overflow menu when present. */
  readonly onDuplicate?: ((template: TemplateSummary) => void) | undefined;
}
