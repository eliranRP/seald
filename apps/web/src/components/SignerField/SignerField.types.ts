import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type SignerFieldKind =
  | 'signature'
  | 'initials'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'email'
  | 'name';

export interface SignerFieldProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'value'> {
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
  readonly onActivate: () => void;
}
