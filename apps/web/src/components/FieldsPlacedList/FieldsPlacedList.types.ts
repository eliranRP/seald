import type { HTMLAttributes, ReactNode } from 'react';
import type { FieldKind } from '@/types/sealdTypes';

export interface FieldsPlacedListSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface FieldsPlacedListItem {
  readonly id: string;
  readonly type: FieldKind;
  readonly page: number;
  readonly signerIds: ReadonlyArray<string>;
}

export interface FieldsPlacedListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly fields: ReadonlyArray<FieldsPlacedListItem>;
  readonly signers: ReadonlyArray<FieldsPlacedListSigner>;
  readonly selectedFieldId?: string | undefined;
  readonly onSelectField?: ((id: string) => void) | undefined;
  /**
   * Fires when the user clicks the Duplicate button on the selected row.
   * Rendered inline next to the row label only while that row is selected.
   */
  readonly onDuplicateField?: ((id: string) => void) | undefined;
  /**
   * Fires when the user clicks the Remove button on the selected row.
   * Same render rule as {@link onDuplicateField}.
   */
  readonly onRemoveField?: ((id: string) => void) | undefined;
  readonly title?: string | undefined;
  readonly emptyHint?: ReactNode | undefined;
}
