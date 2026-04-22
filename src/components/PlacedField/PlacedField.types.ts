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
  readonly signerIds: ReadonlyArray<string>;
}

type RootAttrs = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'onDragStart' | 'onDragEnd'>;

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
  readonly onMove?: ((id: string, x: number, y: number) => void) | undefined;
  readonly onDragStart?: (() => void) | undefined;
  readonly onDragEnd?: (() => void) | undefined;
}
