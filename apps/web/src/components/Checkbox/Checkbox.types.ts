import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange' | 'children'
> {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  /** Short helper text under the label, linked with aria-describedby. */
  readonly hint?: string | undefined;
  readonly disabled?: boolean | undefined;
}
