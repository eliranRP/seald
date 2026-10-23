import { useEffect, useRef, useState } from 'react';
import { DrivePicker } from '@/components/drive-picker';
import { ConversionFailedDialog, ImportOverlay, useDriveImport } from '@/features/gdriveImport';
import type { ImportPhase } from '@/features/gdriveImport';
import {
  useConnectGDrive,
  useGDriveAccounts,
  useReconnectGDrive,
} from './settings/integrations/useGDriveAccounts';

export interface DriveDocumentImportProps {
  /** True while the sender asked to add a document from Drive. */
  readonly open: boolean;
  readonly onClose: () => void;
  /** The sender chose "try again" in the failure dialog: reopen the picker. */
  readonly onRetry: () => void;
  /** Receives the converted PDF, ready to become a new document. */
  readonly onFile: (file: File) => void;
}

/**
 * "Add a document from Google Drive" for the editor (WP-04, flags
 * `gdriveIntegration` + `multiDocumentEnvelopes`). Reuses the upload
 * flow's pieces: the Drive picker, the conversion hook, the progress
 * overlay and the failure dialog. With no connected account, opening
 * starts the OAuth popup instead. Mounted only when both flags are on.
 */
export function DriveDocumentImport(props: DriveDocumentImportProps) {
  const { open, onClose, onRetry, onFile } = props;
  const accountsQuery = useGDriveAccounts();
  const accountId = accountsQuery.data?.[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const reconnectDrive = useReconnectGDrive();
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [fileName, setFileName] = useState('');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const driveImport = useDriveImport({
    accountId: accountId ?? '',
    onReady: (file) => {
      setPhase('done');
      doneTimerRef.current = setTimeout(() => {
        setPhase(null);
        onFile(file);
      }, 800);
    },
  });

  useEffect(
    () => () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    },
    [],
  );

  const { state } = driveImport;
  useEffect(() => {
    if (state.kind === 'starting') {
      setPhase('fetching');
      setFileName(state.file.name);
    } else if (state.kind === 'running') {
      setPhase('converting');
    } else if (state.kind === 'failed') {
      setPhase(null);
    }
  }, [state]);

  // No connected account yet: the button starts the OAuth popup.
  const needsConnect = open && accountsQuery.isSuccess && accountId === null;
  const { mutate: connect } = connectDrive;
  useEffect(() => {
    if (!needsConnect) return;
    connect();
    onClose();
  }, [needsConnect, connect, onClose]);

  return (
    <>
      {accountId !== null ? (
        <DrivePicker
          open={open}
          accountId={accountId}
          onClose={onClose}
          onReconnect={() => reconnectDrive.mutate()}
          onPick={(file) => {
            onClose();
            driveImport.beginImport(file);
          }}
        />
      ) : null}
      <ImportOverlay open={phase !== null} phase={phase ?? 'fetching'} fileName={fileName} />
      <ConversionFailedDialog
        open={state.kind === 'failed'}
        errorCode={state.kind === 'failed' ? state.error : 'conversion-failed'}
        onRetry={() => {
          driveImport.reset();
          onRetry();
        }}
        onClose={() => driveImport.reset()}
      />
    </>
  );
}
