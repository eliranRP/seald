export interface SwitchProps {
  /** Accessible name. The visible text sits next to the switch, so this is not rendered. */
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean | undefined;
  /** True while a save is in flight. The switch keeps its value and ignores further taps. */
  readonly pending?: boolean | undefined;
}
