import type { HTMLAttributes } from 'react';

/**
 * `'success'` — green check icon (default).
 * `'error'`   — red surface for failures.
 * `'info'`    — neutral; no icon glyph.
 */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** Bold first line. */
  readonly title: string;
  /** Smaller second line; omit for a single-line toast. */
  readonly subtitle?: string | undefined;
  readonly tone?: ToastTone;
}
