import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Error codes emitted when a file fails validation before `onFileSelected`
 * is invoked.
 *
 * - `type`: the file's MIME type does not match `accept`.
 * - `size`: the file exceeds `maxSizeBytes`.
 */
export type UploadPageErrorCode = 'type' | 'size';

/**
 * Drives which dropzone state is shown. `idle` is the default empty
 * picker. `analyzing` covers the brief post-drop window where the PDF
 * is parsed + page count + fields are extracted — the dropzone is
 * replaced with an animated "Analyzing your document" loader.
 */
export type UploadPageStatus = 'idle' | 'analyzing';

/**
 * L4 page — centered upload dropzone. The NavBar is provided by the parent
 * `AppShell` layout; this page renders only the dropzone body.
 *
 * The page owns no persistent state. It drives drag-over visuals and file
 * validation, then bubbles the chosen `File` up via `onFileSelected`.
 */
export interface UploadPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Fires with the validated file after a successful drop or picker selection. */
  readonly onFileSelected: (file: File) => void;
  /** Fires instead of `onFileSelected` when the file fails `accept` or `maxSizeBytes`. */
  readonly onError?: ((code: UploadPageErrorCode, message: string) => void) | undefined;

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

  // Loader ---------------------------------------------------------------
  /**
   * When `analyzing`, the dropzone is replaced with an animated loader
   * showing "Analyzing your document". Useful while the chosen PDF is
   * being parsed.
   */
  readonly status?: UploadPageStatus | undefined;
  /** File name to display in the analyzing state. */
  readonly analyzingFileName?: string | undefined;

  // Template integration -------------------------------------------------
  /**
   * Title of the template the sender chose on `/templates/:id/use`. When
   * present, a "Using template: <title>" banner renders above the dropzone
   * with a "Clear template" affordance that fires `onClearTemplate`.
   */
  readonly templateBannerTitle?: string | undefined;
  /** Tone of the template banner. Defaults to `info`. */
  readonly templateBannerTone?: 'info' | 'warning' | undefined;
  /** Strips the `?template=` query arg + any pre-populated field state. */
  readonly onClearTemplate?: (() => void) | undefined;
  /**
   * When supplied, a "Start from a template" CTA is rendered at the
   * bottom of the dropzone. The parent (`UploadRoute`) opens the
   * template-picker dialog and routes to `?template=<id>` once a
   * template is chosen. Hidden when there are no templates yet.
   */
  readonly onPickTemplate?: (() => void) | undefined;

  // Google Drive integration --------------------------------------------
  /**
   * When supplied, a "Pick from Google Drive" CTA is rendered in the
   * same dropzone-footer prompt row as `onPickTemplate`. Use this
   * branch when the user has at least one connected Drive account —
   * clicking opens the Drive picker. Mutually exclusive with
   * `onConnectDrive`: callers pass exactly one based on connection
   * state (the alternate is the OAuth popup wiring).
   */
  readonly onPickDrive?: (() => void) | undefined;
  /**
   * When supplied, a "Connect Google Drive" CTA is rendered in the
   * same prompt row. Used when the user has the feature flag on but
   * no connected Drive account yet — clicking opens the OAuth popup
   * inline (see `useConnectGDrive().mutate()`). Mutually exclusive
   * with `onPickDrive`.
   */
  readonly onConnectDrive?: (() => void) | undefined;
}
