import type { ButtonHTMLAttributes } from 'react';

export interface TemplateChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly name: string;
  /** Number of people the template expects to sign. */
  readonly signers?: number | undefined;
}
