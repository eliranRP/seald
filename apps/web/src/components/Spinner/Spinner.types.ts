import type { HTMLAttributes } from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** sm 12px · md 16px (default) · lg 24px. */
  readonly size?: SpinnerSize | undefined;
  /**
   * Accessible label. When set the spinner is announced as a status;
   * omit it when the surrounding control already says what is loading
   * (the spinner is then decorative).
   */
  readonly label?: string | undefined;
}
