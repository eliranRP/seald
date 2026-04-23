import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface GoogleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly label?: ReactNode | undefined;
  readonly busy?: boolean | undefined;
  readonly fullWidth?: boolean | undefined;
}
