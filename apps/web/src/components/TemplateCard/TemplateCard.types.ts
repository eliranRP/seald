import type { HTMLAttributes } from 'react';
import type { TemplateSummary } from '@/features/templates';

export interface TemplateCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> {
  readonly template: TemplateSummary;
  readonly onUse: (template: TemplateSummary) => void;
  readonly onEdit?: ((template: TemplateSummary) => void) | undefined;
}
