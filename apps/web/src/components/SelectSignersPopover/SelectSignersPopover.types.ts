import type { HTMLAttributes } from 'react';

export interface SelectSignersPopoverSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface SelectSignersPopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly open: boolean;
  readonly signers: ReadonlyArray<SelectSignersPopoverSigner>;
  readonly initialSelectedIds?: ReadonlyArray<string> | undefined;
  readonly onApply: (ids: ReadonlyArray<string>) => void;
  readonly onCancel: () => void;
  readonly title?: string | undefined;
  readonly applyLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
}
