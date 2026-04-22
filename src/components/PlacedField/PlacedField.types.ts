import type { HTMLAttributes, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { FieldKind } from '../../types/sealdTypes';

export interface PlacedFieldSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface PlacedFieldValue {
  readonly id: string;
  readonly page: number;
  readonly type: FieldKind;
  readonly x: number;
  readonly y: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly signerIds: ReadonlyArray<string>;
  /**
   * Whether the field is required for form validation. Defaults to `true`
   * when omitted so legacy fields retain the stricter default; callers can
   * opt into optional fields by setting this to `false`.
   */
  readonly required?: boolean | undefined;
  /**
   * Shared identifier across a set of "linked copies" — fields created in a
   * single Place-on-pages action (one source + one clone per target page).
   * Undefined for standalone fields that have never been duplicated across
   * pages. Used by the remove flow to ask the user whether to delete just
   * this page's copy or every linked copy at once.
   */
  readonly linkId?: string | undefined;
}

type RootAttrs = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onSelect' | 'onDragStart' | 'onDragEnd' | 'onResize'
>;

export interface PlacedFieldProps extends RootAttrs {
  readonly field: PlacedFieldValue;
  readonly signers: ReadonlyArray<PlacedFieldSigner>;
  readonly selected?: boolean | undefined;
  readonly inGroup?: boolean | undefined;
  readonly isDragging?: boolean | undefined;
  readonly canvasRef?: RefObject<HTMLElement> | undefined;
  readonly onSelect?: ((e: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  readonly onOpenSignerPopover?: ((e: ReactMouseEvent<HTMLElement>) => void) | undefined;
  readonly onOpenPagesPopover?: ((e: ReactMouseEvent<HTMLElement>) => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly onToggleRequired?: ((id: string, next: boolean) => void) | undefined;
  readonly onMove?: ((id: string, x: number, y: number) => void) | undefined;
  readonly onResize?:
    | ((id: string, x: number, y: number, width: number, height: number) => void)
    | undefined;
  readonly minWidth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly onDragStart?: (() => void) | undefined;
  readonly onDragEnd?: (() => void) | undefined;
  /**
   * Parent-canvas CSS zoom factor. When the canvas is visually scaled via
   * CSS transform, pointer deltas and rect-derived clamps must be divided by
   * the zoom factor to stay in the field's native (unzoomed) coordinate
   * space. Defaults to 1 (no zoom).
   */
  readonly zoom?: number | undefined;
}
