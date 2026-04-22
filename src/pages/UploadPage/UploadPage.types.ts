import type { HTMLAttributes, ReactNode } from 'react';
import type { NavBarUser } from '../../components/NavBar/NavBar.types';
import type { SideBarNavItem } from '../../components/SideBar/SideBar.types';

/**
 * Error codes emitted when a file fails validation before `onFileSelected`
 * is invoked.
 *
 * - `type`: the file's MIME type does not match `accept`.
 * - `size`: the file exceeds `maxSizeBytes`.
 */
export type UploadPageErrorCode = 'type' | 'size';

/**
 * L4 page — composes NavBar + SideBar + a centered upload dropzone.
 *
 * The page owns no persistent state. It drives drag-over visuals and file
 * validation, then bubbles the chosen `File` up via `onFileSelected`.
 */
export interface UploadPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Fires with the validated file after a successful drop or picker selection. */
  readonly onFileSelected: (file: File) => void;
  /** Fires instead of `onFileSelected` when the file fails `accept` or `maxSizeBytes`. */
  readonly onError?: ((code: UploadPageErrorCode, message: string) => void) | undefined;

  // Chrome ----------------------------------------------------------------
  readonly onLogoClick?: (() => void) | undefined;
  readonly onSelectNavItem?: ((id: string) => void) | undefined;
  readonly activeNavId?: string | undefined;
  readonly user?: NavBarUser | undefined;
  readonly sideBarItems?: ReadonlyArray<SideBarNavItem> | undefined;
  readonly onSelectSideBarItem?: ((id: string) => void) | undefined;
  readonly activeSideBarItemId?: string | undefined;
  /**
   * Contact-management handlers forwarded to the `NavBar`. Keeping these on
   * the upload page (not just the document page) keeps the NavBar's right
   * cluster visually identical between the two screens, so the chrome doesn't
   * visibly resize when the user transitions from upload → sign.
   */
  readonly onAddContact?: (() => void) | undefined;
  readonly onRemoveContact?: (() => void) | undefined;

  // Dropzone copy / limits -----------------------------------------------
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly dropHeading?: string | undefined;
  readonly dropSubheading?: ReactNode | undefined;
  readonly chooseLabel?: string | undefined;
  /** MIME / extension accept pattern passed to the hidden <input type="file">. */
  readonly accept?: string | undefined;
  /** Max accepted file size in bytes. Defaults to 25 MB. */
  readonly maxSizeBytes?: number | undefined;
}
