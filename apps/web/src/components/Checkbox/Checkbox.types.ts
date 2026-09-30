import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'children'
> {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly helpText?: string | undefined;
}
