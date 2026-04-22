import type { DragEvent, HTMLAttributes, ReactNode } from 'react';
import type { FieldKind } from '../../types/sealdTypes';

export interface FieldPaletteProps extends HTMLAttributes<HTMLElement> {
  readonly kinds?: ReadonlyArray<FieldKind> | undefined;
  readonly requiredKinds?: ReadonlyArray<FieldKind> | undefined;
  readonly onFieldDragStart?:
    | ((kind: FieldKind, event: DragEvent<HTMLElement>) => void)
    | undefined;
  readonly onFieldDragEnd?: ((kind: FieldKind, event: DragEvent<HTMLElement>) => void) | undefined;
  readonly onFieldActivate?: ((kind: FieldKind) => void) | undefined;
  readonly hint?: ReactNode | undefined;
}
