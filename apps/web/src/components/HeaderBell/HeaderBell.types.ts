export interface HeaderBellProps {
  /** Pending items. Zero hides the badge. */
  readonly count: number;
  readonly onClick: () => void;
}
