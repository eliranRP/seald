import type { HTMLAttributes } from 'react';

export interface ShortcutsPopoverProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly onClose: () => void;
}

export interface ShortcutRow {
  readonly action: string;
  /** Key caps, in the order they are pressed. */
  readonly keys: ReadonlyArray<string>;
}
