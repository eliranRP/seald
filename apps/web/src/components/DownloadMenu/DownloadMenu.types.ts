import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Minimum contract for an icon component the menu can render: it must
 * accept a numeric `size` and an optional `aria-hidden` (the menu treats
 * the icon as decorative — the row title carries the label). `LucideIcon`
 * satisfies this, as does any small SVG component built for the seald
 * design system (e.g. `GDriveLogo` for the "Save to Google Drive" row).
 */
export type DownloadMenuIcon =
  | LucideIcon
  | ComponentType<{
      readonly size?: number;
      readonly 'aria-hidden'?: boolean | 'true' | 'false';
    }>;

/**
 * One row in the dropdown. `kind` is the opaque tag handed back via
 * `onSelect` — the menu doesn't interpret it.
 *
 * When `available: false` the row renders a LOCKED pill + disabled
 * state. When `recommended: true` the icon tile lights up indigo and
 * a RECOMMENDED pill sits next to the label; the split-button's
 * primary action also fires this row's `kind`. If no row is
 * recommended the first one wins.
 */
export interface DownloadMenuItem {
  readonly kind: string;
  readonly icon: DownloadMenuIcon;
  readonly title: string;
  readonly description: ReactNode;
  /** Mono meta line ("4 pages · 214 KB" / "Available once sealed"). */
  readonly meta: ReactNode;
  readonly available: boolean;
  readonly recommended?: boolean | undefined;
  /** Label the split-button should show when this row is primary.
   *  Falls back to `title` when omitted. */
  readonly primaryLabel?: string | undefined;
  /**
   * Row category. `'download'` (default) rows are plain artifact
   * downloads; `'gdrive'` rows are external actions (push to Drive)
   * rendered below a divider. `'gdrive'` rows are never picked as the
   * split-button's primary action.
   */
  readonly action?: 'download' | 'gdrive' | undefined;
  /** While the gdrive row's spinner shows, override the meta line. */
  readonly busyMeta?: ReactNode | undefined;
}

export interface DownloadMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly items: ReadonlyArray<DownloadMenuItem>;
  /** Fires with the picked row's `kind`. Only unavailable rows are
   *  skipped; the caller is responsible for the download itself. */
  readonly onSelect: (kind: string) => void;
  /** Which row is currently being downloaded — surfaces a spinner +
   *  "Preparing…" meta line on that row. `null` when idle. */
  readonly inFlight?: string | null | undefined;
  /** Disable the whole trigger (envelope not loaded, etc.). */
  readonly disabled?: boolean | undefined;
}
