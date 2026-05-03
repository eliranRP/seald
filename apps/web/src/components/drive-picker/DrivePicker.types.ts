/**
 * Public types for the reusable Google Drive picker modal.
 *
 * Types live in their own file so the component, the hook, the states
 * file, and consumer code (WT-E flow integrations) can all import the
 * picker contract without pulling the runtime modal in.
 */

/**
 * MIME-filter values understood by both the server proxy
 * (`apps/api/src/integrations/gdrive/gdrive.controller.ts`) and the
 * client picker. Mirrors `SUPPORTED_MIME_FILTERS` on the API side; the
 * picker also enforces this list client-side as defence in depth.
 */
export type DriveMimeFilter = 'pdf' | 'doc' | 'docx' | 'all';

/**
 * Subset of Drive `files.list` metadata exposed by the API proxy.
 * Mirrors the `DriveFile` shape declared in
 * `apps/api/src/integrations/gdrive/gdrive.controller.ts`.
 *
 * `mimeType` always starts with one of the supported MIME prefixes —
 * the picker strips any row outside the allow-list as defence in depth
 * (the server already filters server-side).
 */
export interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime?: string;
  readonly size?: string;
}

export interface DrivePickerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (file: DriveFile) => void;
  /** UUID of the connected Google Drive account being browsed. */
  readonly accountId: string;
  /** Defaults to `'all'` (PDF + Doc + Docx). */
  readonly mimeFilter?: DriveMimeFilter;
  /**
   * Called when the user clicks `Reconnect` from the token-expired
   * state. Single-flight enforcement — multiple clicks during a single
   * session must coalesce to one consent popup.
   */
  readonly onReconnect?: () => void;
}
