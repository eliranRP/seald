import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * primary (indigo) · secondary (paper + border) · ghost (transparent) ·
 * danger (solid red, destructive confirm) · dark (ink, rare emphasis).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
/** sm 32px · md 44px (default) · lg 48px tall. */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly iconLeft?: LucideIcon | undefined;
  readonly iconRight?: LucideIcon | undefined;
  readonly loading?: boolean | undefined;
  readonly fullWidth?: boolean | undefined;
  /**
   * Square icon button (canvas `.btn-icon`). Pass the glyph as `iconLeft`
   * and name it with `aria-label`; children are optional.
   */
  readonly iconOnly?: boolean | undefined;
  readonly children?: ReactNode;
}
