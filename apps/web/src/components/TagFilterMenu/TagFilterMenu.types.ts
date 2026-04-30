export interface TagFilterMenuProps {
  readonly allTags: ReadonlyArray<string>;
  readonly counts: Readonly<Record<string, number>>;
  readonly selected: ReadonlyArray<string>;
  readonly onToggle: (tag: string) => void;
  readonly onClear: () => void;
}
