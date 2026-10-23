import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';

export interface PersonPickerProps {
  /** Who is chosen; null shows the dashed "Choose a person" state. */
  readonly value: AddSignerContact | null;
  /** Everyone offered in the list (the sender first, then contacts). */
  readonly options: ReadonlyArray<AddSignerContact>;
  readonly onChange: (person: AddSignerContact) => void;
  /**
   * Adds a person by email ("+ New email"). Resolve with the saved contact;
   * reject to show an error under the field. Omit to hide the row.
   */
  readonly onCreate?: ((email: string) => Promise<AddSignerContact>) | undefined;
  /** Names the trigger, e.g. "Person for Signer 1". */
  readonly 'aria-label': string;
  /** Option ids already chosen for another role (shown but not pickable). */
  readonly disabledIds?: ReadonlyArray<string> | undefined;
  /** Id of the sender's own entry; its second line reads "Your account". */
  readonly youId?: string | undefined;
  /**
   * Open the list in the page flow, pushing what is below it down, instead
   * of floating over it. For use inside a scrolling dialog body.
   */
  readonly inline?: boolean | undefined;
}
