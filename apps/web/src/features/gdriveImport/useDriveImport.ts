import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelConversion,
  fetchConvertedPdf,
  pollConversion,
  startConversion,
  type ConversionErrorCode,
  type ConversionJobView,
} from './conversionApi';
import type { DriveFile } from '@/components/drive-picker';

const POLL_INTERVAL_MS_DEFAULT = 1500;

/**
 * Orchestrator hook that turns a DrivePicker selection into a regular
 * `File` the existing upload flow already understands. Three phases:
 *
 *   1. `beginImport(driveFile)` — POSTs `/integrations/gdrive/conversion`
 *      and flips state to `running`. Polling kicks in every 1.5s.
 *   2. The first poll that returns `done` triggers a fetch against the
 *      job's signed `assetUrl`; the resulting blob is wrapped in a
 *      `File` (named `<driveFile.name>.pdf`) and handed back via the
 *      caller's `onReady` callback.
 *   3. `cancelImport()` issues `DELETE /:jobId` and resets to idle.
 *
 * `state.kind === 'failed'` carries one of WT-A-1's named error codes;
 * the failure dialog reads it directly. The hook does NOT show UI —
 * progress + error dialogs live next to the route surfaces.
 */

export type DriveImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting'; readonly file: DriveFile }
  | { readonly kind: 'running'; readonly file: DriveFile; readonly jobId: string }
  | { readonly kind: 'failed'; readonly file: DriveFile; readonly error: ConversionErrorCode };

export interface UseDriveImportArgs {
  readonly accountId: string;
  readonly onReady: (file: File) => void;
  /**
   * Override the poll interval for tests. Production callers omit
   * this and get the canonical 1500 ms cadence.
   */
  readonly pollIntervalMs?: number;
}

export interface UseDriveImportReturn {
  readonly state: DriveImportState;
  readonly beginImport: (file: DriveFile) => void;
  readonly cancelImport: () => Promise<void>;
  readonly reset: () => void;
}

function pdfFileName(driveFile: DriveFile): string {
  if (driveFile.name.toLowerCase().endsWith('.pdf')) return driveFile.name;
  return `${driveFile.name}.pdf`;
}

function pickErrorCode(view: ConversionJobView): ConversionErrorCode {
  return view.errorCode ?? 'conversion-failed';
}

const KNOWN_ERROR_CODES: ReadonlySet<ConversionErrorCode> = new Set([
  'token-expired',
  'oauth-declined',
  'no-files-match-filter',
  'conversion-failed',
  'file-too-large',
  'unsupported-mime',
  'rate-limited',
  'cancelled',
]);

function extractStartErrorCode(err: unknown): ConversionErrorCode {
  // The shared apiClient surfaces axios errors with `response.data.error`
  // OR `response.data.code`; we accept either to stay tolerant of WT-D
  // controller variants (NotFound vs. HttpException).
  const data = (err as { response?: { data?: { error?: string; code?: string } } } | null)?.response
    ?.data;
  const candidate = data?.error ?? data?.code;
  if (typeof candidate === 'string' && (KNOWN_ERROR_CODES as ReadonlySet<string>).has(candidate)) {
    return candidate as ConversionErrorCode;
  }
  return 'conversion-failed';
}

export function useDriveImport(args: UseDriveImportArgs): UseDriveImportReturn {
  const { accountId, onReady, pollIntervalMs = POLL_INTERVAL_MS_DEFAULT } = args;
  const [state, setState] = useState<DriveImportState>({ kind: 'idle' });

  // Mutable refs prevent stale-state captures inside the async polling
  // loop. The polling token also lets us cancel a stale loop when the
  // user picks a second file before the first finishes.
  const cancelledRef = useRef(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  /**
   * Single-responsibility async loop: polls the job, branches on
   * status, and either calls `onReady` or transitions to `failed`.
   * Lives in a ref-stable function so we can fire it from `beginImport`
   * without re-deriving on every render. (rule 4.4 — one effect per
   * responsibility; this isn't an effect, it's a one-shot kick-off.)
   */
  const runPollLoop = useCallback(
    async (jobId: string, file: DriveFile): Promise<void> => {
      // Each iteration sleeps `POLL_INTERVAL_MS` after the FIRST poll,
      // not before — so the user sees progress nearly immediately on a
      // PDF passthrough (which the API completes in ~100ms).
      let firstIter = true;
      while (!cancelledRef.current) {
        if (!firstIter) {
          await new Promise((res) => setTimeout(res, pollIntervalMs));
          if (cancelledRef.current) return;
        }
        firstIter = false;
        let view: ConversionJobView;
        try {
          view = await pollConversion(jobId);
        } catch {
          if (cancelledRef.current) return;
          setState({ kind: 'failed', file, error: 'conversion-failed' });
          return;
        }
        if (cancelledRef.current) return;
        if (view.status === 'done' && view.assetUrl) {
          try {
            const blob = await fetchConvertedPdf(view.assetUrl);
            if (cancelledRef.current) return;
            const out = new File([blob], pdfFileName(file), {
              type: 'application/pdf',
            });
            setState({ kind: 'idle' });
            onReadyRef.current(out);
          } catch {
            if (cancelledRef.current) return;
            setState({ kind: 'failed', file, error: 'conversion-failed' });
          }
          return;
        }
        if (view.status === 'failed') {
          setState({ kind: 'failed', file, error: pickErrorCode(view) });
          return;
        }
        if (view.status === 'cancelled') {
          setState({ kind: 'idle' });
          return;
        }
        // pending | converting → loop.
      }
    },
    [pollIntervalMs],
  );

  const beginImport = useCallback(
    (file: DriveFile) => {
      cancelledRef.current = false;
      setState({ kind: 'starting', file });
      void (async () => {
        try {
          const start = await startConversion({
            accountId,
            fileId: file.id,
            mimeType: file.mimeType,
          });
          if (cancelledRef.current) return;
          setState({ kind: 'running', file, jobId: start.jobId });
          await runPollLoop(start.jobId, file);
        } catch (err) {
          if (cancelledRef.current) return;
          // Map the API's `{ error: '<code>' }` body onto our enum;
          // anything we can't recognise becomes 'conversion-failed'.
          setState({ kind: 'failed', file, error: extractStartErrorCode(err) });
        }
      })();
    },
    [accountId, runPollLoop],
  );

  const cancelImport = useCallback(async (): Promise<void> => {
    cancelledRef.current = true;
    const current = state;
    if (current.kind === 'running') {
      try {
        await cancelConversion(current.jobId);
      } catch {
        // Server may already have completed; benign.
      }
    }
    setState({ kind: 'idle' });
  }, [state]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setState({ kind: 'idle' });
  }, []);

  // Make sure a hot-unmounted parent doesn't keep a poll loop alive.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return { state, beginImport, cancelImport, reset };
}
