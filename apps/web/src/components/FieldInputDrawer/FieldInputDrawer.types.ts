import type { HTMLAttributes } from 'react';

export type FieldInputKind = 'text' | 'email' | 'date' | 'name';

export interface FieldInputDrawerProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly label: string;
  readonly kind: FieldInputKind;
  readonly initialValue?: string | undefined;
  readonly onCancel: () => void;
  readonly onApply: (value: string) => void;
}
