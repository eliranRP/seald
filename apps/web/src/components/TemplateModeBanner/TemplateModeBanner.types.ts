import type { HTMLAttributes } from 'react';

/**
 * `'success'` — emerald wash, used when the editor confirms a happy
 *               path step ("Last step — place fields, then save as
 *               template" while authoring a brand-new template).
 * `'info'`    — indigo wash, used when applying a saved layout onto
 *               a fresh document.
 */
export type TemplateModeBannerTone = 'success' | 'info';

export interface TemplateModeBannerProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: TemplateModeBannerTone;
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Optional dismiss handler; renders a small ✕ on the right when set. */
  readonly onDismiss?: (() => void) | undefined;
}
