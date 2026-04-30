import type { HTMLAttributes } from 'react';

export interface TagEditorPopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onToggle'> {
  readonly open: boolean;
  /** Tags currently attached to the target template. */
  readonly currentTags: ReadonlyArray<string>;
  /** Every known tag in the template set. Drives the dedupe + suggest list. */
  readonly allTags: ReadonlyArray<string>;
  /** Toggle membership of an existing tag on the target template. */
  readonly onToggle: (tag: string) => void;
  /** Add a brand-new tag (not present in `allTags` yet). */
  readonly onCreate: (tag: string) => void;
  readonly onClose: () => void;
}
