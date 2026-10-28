import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface MobileNavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly href: string;
}

export interface MobileNavProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * Four destinations. The first two render left of the raised "New"
   * button, the rest to its right (Documents · Templates · + · Contacts · Me).
   */
  readonly items: ReadonlyArray<MobileNavItem>;
  readonly activeId?: string | undefined;
  /** Client-side navigation; plain clicks are intercepted, modified clicks are not. */
  readonly onNavigate: (id: string, href: string) => void;
  readonly onNew: () => void;
  /**
   * Calm (paper, not accent) centre button, for screens whose own primary
   * action should be the only accent. The FAB also goes calm by itself while
   * any element on the page carries `data-page-primary`.
   */
  readonly calm?: boolean | undefined;
  /** Accessible name of the centre button. Default "New document". */
  readonly newLabel?: string | undefined;
}
