import type { HTMLAttributes } from 'react';

/**
 * Stage in the template flow:
 *
 *   1. Signers — pick who will receive this template's signature request.
 *   2. Document — choose between the saved example PDF and a fresh upload.
 *   3. Fields  — pre-populated by `resolveTemplateFields`; user reviews
 *                + sends. This step is the existing place-fields editor at
 *                `/document/new?template=<id>`, so the FlowHeader doesn't
 *                render on that step.
 */
export type TemplateFlowStep = 1 | 2 | 3;

/**
 * `'new'`     — sender is authoring a brand-new template.
 * `'using'`   — sender is firing a saved template into a new envelope.
 * `'editing'` — sender opened the template's edit view (shipped as
 *               `?mode=edit`); behaves like `'using'` but the badge label
 *               flips to "Editing template".
 */
export type TemplateFlowMode = 'new' | 'using' | 'editing';

export interface TemplateFlowHeaderProps extends HTMLAttributes<HTMLElement> {
  readonly step: TemplateFlowStep;
  readonly mode: TemplateFlowMode;
  readonly templateName: string;
  /**
   * When provided, the template name becomes inline-editable: clicking
   * shows a textbox; Enter / blur commits, Escape reverts. The host page
   * is responsible for persisting the rename — local-state today, will
   * become `PATCH /templates/:id` once the API client lands.
   */
  readonly onRenameTemplate?: ((next: string) => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onCancel?: (() => void) | undefined;
}
