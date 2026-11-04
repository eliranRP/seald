import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * `'success'` — green check (default).
 * `'error'`   — alert glyph, announced assertively.
 * `'info'`    — neutral info glyph.
 */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** The message ("Sent to 3 signers"). */
  readonly title: string;
  /** Smaller second line; omit for a single-line toast. */
  readonly subtitle?: string | undefined;
  readonly tone?: ToastTone;
  /** Replace the tone glyph; `null` hides it. */
  readonly icon?: LucideIcon | null | undefined;
  /** One inline action after a divider, e.g. Undo or Retry. */
  readonly action?: ToastAction | undefined;
  /** Renders a Dismiss (×) button and is called by the auto-dismiss timer. */
  readonly onClose?: (() => void) | undefined;
  /**
   * Auto-dismiss after this many ms (calls `onClose`). The timer pauses
   * while the pointer or focus is inside the toast. Omit for a sticky toast.
   * Clamped to at least 4000ms; ignored for `tone="error"` with `onClose`
   * (errors stay until dismissed).
   */
  readonly duration?: number | undefined;
  /**
   * `fixed` (default) floats bottom-centre over the page (above the mobile
   * bottom nav on phones); `inline` renders in flow (stories, previews).
   */
  readonly placement?: 'fixed' | 'inline' | undefined;
}
