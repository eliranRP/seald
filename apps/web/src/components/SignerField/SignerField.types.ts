import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type SignerFieldKind =
  | 'signature'
  | 'initials'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'email'
  | 'name'
  | 'number'
  | 'radio'
  | 'dropdown';

export interface SignerFieldProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'value'
> {
  readonly kind: SignerFieldKind;
  readonly label: string;
  readonly required: boolean;
  readonly active: boolean;
  readonly filled: boolean;
  readonly value?: string | boolean | null | undefined;
  /** Absolute position inside the parent page (px). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Optional override for the rendered filled value (e.g. SignatureMark). */
  readonly previewNode?: ReactNode | undefined;
  /** Short instruction in a pill beside the current field ("Sign", "Initial", "Fill"). */
  readonly tag?: string | undefined;
  /** Value was filled for the signer (name, date): shows a small "Auto" tag. */
  readonly auto?: boolean | undefined;
  readonly autoLabel?: string | undefined;
  readonly onActivate: () => void;
}
