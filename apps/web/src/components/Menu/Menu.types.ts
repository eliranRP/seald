import type { HTMLAttributes, ReactElement, ReactNode, Ref, RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface MenuActionItem {
  readonly type?: 'item' | undefined;
  /** Stable key. */
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: LucideIcon | undefined;
  /** Destructive action — red text. */
  readonly danger?: boolean | undefined;
  /**
   * Defined → the item is a `menuitemradio` with `aria-checked` and shows a
   * trailing check when true (filters, sort, "Updated" ranges).
   */
  readonly checked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** In-flight — disabled + `aria-busy`. */
  readonly busy?: boolean | undefined;
  readonly onSelect: () => void;
}

export interface MenuSeparator {
  readonly type: 'separator';
  readonly id: string;
}

export interface MenuGroupLabel {
  readonly type: 'label';
  readonly id: string;
  readonly label: string;
}

export type MenuEntry = MenuActionItem | MenuSeparator | MenuGroupLabel;

export type MenuCloseReason = 'select' | 'escape' | 'outside' | 'tab';

export interface MenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  readonly open: boolean;
  readonly onClose: (reason: MenuCloseReason) => void;
  readonly items: ReadonlyArray<MenuEntry>;
  /** Non-interactive block above the items (e.g. account name + email). */
  readonly header?: ReactNode | undefined;
  /** Which edge of the anchor the menu lines up with. Default `end` (right). */
  readonly align?: 'start' | 'end' | undefined;
  /**
   * The trigger. Clicks on it are not "outside" clicks, and focus returns to
   * it when the menu closes with Escape or a selection.
   */
  readonly anchorRef?: RefObject<HTMLElement | null> | undefined;
  /** Focus the first enabled item on open. Default true. */
  readonly autoFocus?: boolean | undefined;
}

export interface MenuTriggerProps {
  readonly ref: Ref<HTMLButtonElement>;
  readonly 'aria-haspopup': 'menu';
  readonly 'aria-expanded': boolean;
  readonly 'aria-controls': string | undefined;
  readonly onClick: () => void;
}

export interface MenuButtonProps extends Omit<
  MenuProps,
  'open' | 'onClose' | 'anchorRef' | 'aria-label'
> {
  /** Renders the trigger; spread the given props onto a button. */
  readonly trigger: (props: MenuTriggerProps) => ReactElement;
  /** Names the menu, e.g. "More actions for NDA.pdf". */
  readonly 'aria-label': string;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}
