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
  /**
   * Per-kind count of how many fields of this kind are currently placed in
   * the document. Rendered as a small pill next to each row so users can
   * see at a glance how many Signature/Date/Email fields exist without
   * scanning the canvas. Missing keys are treated as 0.
   */
  readonly usageByKind?: Partial<Record<FieldKind, number>> | undefined;
}
