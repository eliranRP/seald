import type { TemplateSummary } from '@/features/templates';

export interface TemplatePickerDialogProps {
  /** When false the dialog renders nothing. */
  readonly open: boolean;
  /** Templates to show. The dialog filters in-memory; the parent owns the source. */
  readonly templates: ReadonlyArray<TemplateSummary>;
  /** Fires when the user picks a template — parent applies the layout. */
  readonly onPick: (template: TemplateSummary) => void;
  /** Fires when the dialog is dismissed (backdrop / Esc / Cancel / close X). */
  readonly onClose: () => void;
}
