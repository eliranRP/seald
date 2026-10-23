import type { HTMLAttributes } from 'react';

/**
 * `'new'`     — the sender is authoring a brand-new template.
 * `'using'`   — the sender opened a saved template to send it (Review fields).
 * `'editing'` — the sender is editing a saved template (`?mode=edit`).
 */
export type TemplateFlowMode = 'new' | 'using' | 'editing';

export interface TemplateFlowHeaderProps extends HTMLAttributes<HTMLElement> {
  readonly mode: TemplateFlowMode;
  readonly templateName: string;
  /** Quiet line under the name, e.g. "3 pages". */
  readonly meta?: string | undefined;
  /**
   * When provided, the template name becomes inline-editable: clicking
   * shows a textbox; Enter / blur commits, Escape reverts. The host
   * persists the rename.
   */
  readonly onRenameTemplate?: ((next: string) => void) | undefined;
  /** Close (X) and Cancel: back to the Templates list. */
  readonly onCancel?: (() => void) | undefined;
  /** Shows the primary "Save template" button (authoring and editing). */
  readonly onSave?: (() => void) | undefined;
  readonly saveLabel?: string | undefined;
  /** Save in flight: the button shows its spinner. */
  readonly saving?: boolean | undefined;
}
