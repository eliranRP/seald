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
 * Drives which area state is shown. `idle` is the empty dropzone.
 * `analyzing` covers the window where the PDF is read and counted;
 * `converting` is the same for a Word file that is first turned into a
 * PDF on the server. Both swap the dropzone for a file card with a
 * checklist.
 */
export type UploadPageStatus = 'idle' | 'analyzing' | 'converting';

/** A recent template offered as a one-click start. */
export interface UploadRecentTemplate {
  readonly id: string;
  readonly name: string;
  readonly signers?: number | undefined;
}

/**
 * L4 page: the upload surface. The NavBar is provided by the parent
 * `AppShell` layout; the flow header (Upload, Prepare, Send) is rendered
 * by the route.
 *
 * The page owns no persistent state. It drives drag-over visuals and file
 * validation, then bubbles the chosen `File` up via `onFileSelected`.
 */
export interface UploadPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Fires with the validated file after a successful drop or picker selection. */
  readonly onFileSelected: (file: File) => void;
  /** Fires instead of `onFileSelected` when the file fails `accept` or `maxSizeBytes`. */
  readonly onError?: ((code: UploadPageErrorCode, message: string) => void) | undefined;

  // Multiple files (flag `multiDocumentEnvelopes`) -------------------------
  /**
   * When `true`, the picker and the dropzone accept several files and the
   * validated list is handed to `onFilesSelected` (falling back to
   * `onFileSelected` with the first one when that is not supplied).
   */
  readonly multiple?: boolean | undefined;
  /** Fires with every validated file, in pick order, when `multiple` is on. */
  readonly onFilesSelected?: ((files: ReadonlyArray<File>) => void) | undefined;

  // Copy / limits ----------------------------------------------------------
  readonly title?: string | undefined;
  /** Kept for hosts that still pass a sentence; the new design shows none by default. */
  readonly subtitle?: string | undefined;
  /** Omit the page title block when the host renders its own header. */
  readonly hideHeader?: boolean | undefined;
  readonly dropHeading?: string | undefined;
  readonly dropSubheading?: ReactNode | undefined;
  readonly chooseLabel?: string | undefined;
  /** MIME / extension accept pattern passed to the hidden <input type="file">. */
  readonly accept?: string | undefined;
  /** Max accepted file size in bytes. Defaults to 25 MB. */
  readonly maxSizeBytes?: number | undefined;
  /** Also accept Word (.docx/.doc). Copy switches to "PDF or Word". */
  readonly allowWord?: boolean | undefined;

  // Loader -----------------------------------------------------------------
  readonly status?: UploadPageStatus | undefined;
  /** File name to display in the loading card. */
  readonly analyzingFileName?: string | undefined;
  /** Size of the file in the loading card, in bytes. */
  readonly analyzingFileSize?: number | undefined;
  /** Page count once known; ticks the "Pages" step with its number. */
  readonly analyzedPages?: number | undefined;
  /** Cancel the work in progress and return to the empty dropzone. */
  readonly onCancelAnalysis?: (() => void) | undefined;
  /** Conversion failed: show the failure card instead of the checklist. */
  readonly conversionFailed?: boolean | undefined;
  readonly onRetryConversion?: (() => void) | undefined;

  // Sources ----------------------------------------------------------------
  /** Show the source tiles (Upload, Template, Drive, Scan). */
  readonly showSources?: boolean | undefined;
  readonly onPickTemplate?: (() => void) | undefined;
  /** Number of saved templates, shown under the Template tile. */
  readonly templateCount?: number | undefined;
  /** Up to three recent templates as one-click chips. */
  readonly recentTemplates?: ReadonlyArray<UploadRecentTemplate> | undefined;
  readonly onPickRecentTemplate?: ((id: string) => void) | undefined;
  /** "Scan with phone": opens `/scan`. */
  readonly onScan?: (() => void) | undefined;

  // Template integration ---------------------------------------------------
  /** Title of the template the sender chose; shows a "Using template" banner. */
  readonly templateBannerTitle?: string | undefined;
  readonly templateBannerTone?: 'info' | 'warning' | undefined;
  /** Strips the `?template=` query arg and any pre-populated field state. */
  readonly onClearTemplate?: (() => void) | undefined;

  // Google Drive -----------------------------------------------------------
  /** Connected account: the Drive tile opens the picker. */
  readonly onPickDrive?: (() => void) | undefined;
  /** No account yet: the Drive tile starts the OAuth popup. */
  readonly onConnectDrive?: (() => void) | undefined;
}
