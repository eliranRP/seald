import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly iconLeft?: LucideIcon | undefined;
  readonly iconRight?: LucideIcon | undefined;
  readonly loading?: boolean | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly children: ReactNode;
}
