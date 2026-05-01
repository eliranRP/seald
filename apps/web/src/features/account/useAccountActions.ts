import { useCallback, useState } from 'react';
import { deleteAccount, exportAccount } from './accountApi';

/**
 * Options for `useAccountActions`. Inversion-of-control: the hook owns
 * the API + retry state, but lifecycle hooks (post-delete sign-out,
 * error toasts) live on the caller.
 */
export interface UseAccountActionsOptions {
  /** Called after a successful DELETE /me; usually triggers sign-out + redirect. */
  readonly onAccountDeleted?: () => void | Promise<void>;
  /**
   * Optional friendly-error reporter. Defaults to `window.alert`. The
   * hook never throws to the caller; errors are surfaced through
   * `lastError` and (optionally) this callback.
   */
  readonly onError?: (message: string) => void;
}

/**
 * Result shape: imperative `exportData` / `deleteAccount` triggers plus
 * loading/error UI state. Both triggers are stable (`useCallback`) so
 * they can safely sit in dependency arrays.
 */
export interface UseAccountActions {
  readonly exportData: () => Promise<void>;
  readonly deleteAccount: () => Promise<void>;
  readonly isExporting: boolean;
  readonly isDeleting: boolean;
  readonly lastError: string | null;
}

/**
 * Imperative hook that wires the two `/me` endpoints to UI affordances.
 *
 * - `exportData` calls `GET /me/export`, materializes the resulting blob
 *   into a download anchor, and clicks it. We use a temporary anchor
 *   (rather than `window.location = blobUrl`) so the user sees a
 *   browser-native save dialog and the SPA stays where it is.
 * - `deleteAccount` first asks the user to type the confirm phrase
 *   (`'DELETE_MY_ACCOUNT'`) into a `window.prompt`, mirroring the
 *   server-side DTO so a misclick can't wipe the account. On success it
 *   calls `onAccountDeleted` (caller signs out + redirects).
 */
export function useAccountActions(options: UseAccountActionsOptions = {}): UseAccountActions {
  const { onAccountDeleted, onError } = options;
  const [isExporting, setExporting] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const reportError = useCallback(
    (message: string): void => {
      setLastError(message);
      if (onError) {
        onError(message);
      } else if (typeof window !== 'undefined') {
        window.alert(message);
      }
    },
    [onError],
  );

  const exportData = useCallback(async (): Promise<void> => {
    if (isExporting) return;
    setExporting(true);
    setLastError(null);
    try {
      const { blob, filename } = await exportAccount();
      triggerBlobDownload(blob, filename);
    } catch (err) {
      reportError(extractMessage(err, 'Export failed. Please try again later.'));
    } finally {
      setExporting(false);
    }
  }, [isExporting, reportError]);

  const deleteAccountAction = useCallback(async (): Promise<void> => {
    if (isDeleting) return;
    if (typeof window === 'undefined') return;
    const reply = window.prompt(
      'This will permanently delete your account, every envelope you sent, and every contact / template you saved. ' +
        'Type DELETE_MY_ACCOUNT (uppercase, no quotes) to confirm.',
    );
    if (reply !== 'DELETE_MY_ACCOUNT') {
      // User cancelled or typed the wrong phrase — silent no-op.
      return;
    }
    setDeleting(true);
    setLastError(null);
    try {
      await deleteAccount();
      if (onAccountDeleted) await onAccountDeleted();
    } catch (err) {
      reportError(extractMessage(err, 'Account deletion failed. Please try again later.'));
    } finally {
      setDeleting(false);
    }
  }, [isDeleting, onAccountDeleted, reportError]);

  return {
    exportData,
    deleteAccount: deleteAccountAction,
    isExporting,
    isDeleting,
    lastError,
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  // Create a short-lived object URL, click an anchor, then revoke so we
  // don't leak the blob into memory across the session. Wrapped in a
  // typeof-window guard for SSR safety even though the SPA is
  // client-only today.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
