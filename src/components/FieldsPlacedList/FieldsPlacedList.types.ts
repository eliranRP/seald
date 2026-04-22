import type { HTMLAttributes, ReactNode } from 'react';
import type { FieldKind } from '../../types/sealdTypes';

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
  readonly title?: string | undefined;
  readonly emptyHint?: ReactNode | undefined;
}
