import type { HTMLAttributes, ReactNode } from 'react';
import type { NavBarMode, NavBarUser } from '../../components/NavBar/NavBar.types';

/**
 * Error codes emitted when a file fails validation before `onFileSelected`
 * is invoked.
 *
 * - `type`: the file's MIME type does not match `accept`.
 * - `size`: the file exceeds `maxSizeBytes`.
 */
export type UploadPageErrorCode = 'type' | 'size';

/**
 * L4 page — composes NavBar + a centered upload dropzone.
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
  /** NavBar mode: `authed` renders the avatar, `guest` renders Sign in / Sign up CTAs. */
  readonly navMode?: NavBarMode | undefined;
  readonly onSignIn?: (() => void) | undefined;
  readonly onSignUp?: (() => void) | undefined;
  readonly onSignOut?: (() => void) | undefined;

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
