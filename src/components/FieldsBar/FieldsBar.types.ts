import type { DragEvent, HTMLAttributes } from 'react';
import type { FieldKind } from '../../types/sealdTypes';

export type FieldsBarSigner = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly colorToken?: 'indigo' | 'success' | undefined;
};

export interface FieldsBarProps extends HTMLAttributes<HTMLElement> {
  readonly fieldKinds?: ReadonlyArray<FieldKind> | undefined;
  readonly onFieldDragStart?:
    | ((kind: FieldKind, event: DragEvent<HTMLDivElement>) => void)
    | undefined;
  readonly onFieldDragEnd?:
    | ((kind: FieldKind, event: DragEvent<HTMLDivElement>) => void)
    | undefined;
  readonly onFieldActivate?: ((kind: FieldKind) => void) | undefined;
  readonly signers?: ReadonlyArray<FieldsBarSigner> | undefined;
  readonly onAddSigner?: (() => void) | undefined;
  readonly activeSignerId?: string | undefined;
  readonly onSelectSigner?: ((id: string) => void) | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
}
