import { useEffect, useRef, useState } from 'react';
import type { DriveFile } from '@/components/drive-picker';
import { cancelConversion } from './conversionApi';
import type { ImportPhase } from './ImportOverlay';
import { useDriveImport } from './useDriveImport';
import type { DriveImportState } from './useDriveImport';

/** How long the overlay shows every step green before handing the file over. */
export const DRIVE_IMPORT_DONE_MS = 800;

export interface UseDriveImportOverlayArgs {
  readonly accountId: string;
  /** Receives the converted PDF once the "done" phase has shown. */
  readonly onFile: (file: File) => void;
  /** Passed through to `useDriveImport` (tests). */
  readonly pollIntervalMs?: number;
}

export interface UseDriveImportOverlayReturn {
  /** The overlay's phase, or null when it is closed. */
  readonly phase: ImportPhase | null;
  /** The Drive file's name, shown under the overlay title. */
  readonly fileName: string;
  /** The underlying import state; `failed` drives the failure dialog. */
  readonly state: DriveImportState;
  /** Start importing a picked Drive file. Drops any earlier pending hand-off. */
  readonly beginImport: (file: DriveFile) => void;
  /** Stop the import, or drop a converted file still in its "done" window. */
  readonly cancel: () => void;
  /** Clear a failed import (the failure dialog's close / retry). */
  readonly reset: () => void;
}

/**
 * The Drive import overlay as one state machine, shared by the upload
 * screen and the editor's "Add from Drive":
 *
 *   closed -> fetching (starting) -> converting (running) -> done (800 ms) -> closed + onFile
 *   any    -> closed (failed; the failure dialog takes over)
 *
 * The "done" phase is local: `useDriveImport` is already back to idle by
 * then. Its hand-off timer is cancelled by a new import, by `cancel`, and on
 * unmount, so a late timer can never overwrite what the sender did since.
 */
export function useDriveImportOverlay(
  args: UseDriveImportOverlayArgs,
): UseDriveImportOverlayReturn {
  const { accountId, onFile, pollIntervalMs } = args;
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  }, [onFile]);

  const clearTimer = (): void => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  const driveImport = useDriveImport({
    accountId,
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    onReady: (file) => {
      clearTimer();
      setDone(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        setDone(false);
        onFileRef.current(file);
      }, DRIVE_IMPORT_DONE_MS);
    },
  });

  useEffect(() => clearTimer, []);

  const { state } = driveImport;
  let phase: ImportPhase | null = null;
  if (done) phase = 'done';
  else if (state.kind === 'starting') phase = 'fetching';
  else if (state.kind === 'running') phase = 'converting';

  return {
    phase,
    fileName,
    state,
    beginImport: (file) => {
      clearTimer();
      setDone(false);
      setFileName(file.name);
      driveImport.beginImport(file);
    },
    cancel: () => {
      clearTimer();
      setDone(false);
      // Tell the server to drop a running job, but reset synchronously: an
      // awaited reset could land after a newer import and wipe it.
      if (state.kind === 'running') void cancelConversion(state.jobId).catch(() => undefined);
      if (state.kind !== 'idle') driveImport.reset();
    },
    reset: driveImport.reset,
  };
}
