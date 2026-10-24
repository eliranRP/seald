import type { ButtonHTMLAttributes } from 'react';

export interface TemplateChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly name: string;
  /** Number of people the template expects to sign. */
  readonly signers?: number | undefined;
  /** Phone layout: a full-width card row (UploadMobile `.m-card`). */
  readonly card?: boolean | undefined;
}
