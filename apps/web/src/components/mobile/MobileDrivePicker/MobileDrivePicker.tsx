import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { File as FileIcon, Folder, X } from 'lucide-react';
import { apiClient, type ApiError } from '@/lib/api/apiClient';
import { reportSignerEvent } from '@/features/signing/telemetry';
import { useDriveImport } from '@/features/gdriveImport';
import type { DriveFile } from '@/components/drive-picker';
import {
  Backdrop,
  Empty,
  Header,
  HeaderTitle,
  IconButton,
  ImportingOverlay,
  PrimaryAction,
  Row,
  RowIcon,
  RowSub,
  RowText,
  RowTitle,
  ScrollList,
  Skeleton,
  Spinner,
  StateText,
  StateTitle,
  Surface,
} from './styles';

/**
 * Mobile-only Google Drive picker. Opens as a full-screen sheet (slides
 * up from the bottom) on the /m/send flow when the sender taps "Import
 * from Google Drive". Custom UI is justified mobile-only carve-out
 * (Q1 in clarifications-mobile.md): Google's own Picker iframe ships
 * with a >=768 px minimum viewport which breaks the 320–414 px contract
 * of /m/send.
 *
 * Reuses the WT-A-2 list-files proxy (`GET /integrations/gdrive/files`)
 * and the WT-D conversion orchestrator (`useDriveImport`) — no backend
 * changes. The component itself emits three telemetry events:
 *  - `mobile.gdrive.picker_open` once when the sheet first mounts
 *  - `mobile.gdrive.file_selected` on row tap
 *  - `mobile.gdrive.converted` once the converted PDF is in hand
 */

export interface MobileDrivePickerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (file: File) => void;
  readonly accountId: string;
  /** Tapping "Re-authorize" or "Connect Google Drive" calls this. */
  readonly onReconnect?: () => void;
}

interface DriveFilesResponse {
  readonly files: ReadonlyArray<DriveFile>;
}

function formatModified(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as ApiError).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

export function MobileDrivePicker(props: MobileDrivePickerProps): JSX.Element | null {
  const { open, onClose, onPick, accountId, onReconnect } = props;
  const [importing, setImporting] = useState<DriveFile | null>(null);
  // Mirror `importing` in a ref so the `onReady` callback registered
  // with `useDriveImport` (captured at hook-init time) can see the file
  // it's converting even when state updates haven't flushed yet (rule
  // 4.4 — keep one effect, one responsibility; the ref short-circuits
  // a stale-closure read without coupling the conversion side-effect to
  // a re-render).
  const importingRef = useRef<DriveFile | null>(null);

  // Single-flight: emit picker_open telemetry exactly once per sheet
  // mount (rule 4.4 — one effect, one responsibility). Re-opens fire
  // again because the parent unmounts/remounts via `open`.
  const reportedOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      reportedOpenRef.current = false;
      return;
    }
    if (reportedOpenRef.current) return;
    reportedOpenRef.current = true;
    reportSignerEvent({ type: 'mobile.gdrive.picker_open', account_id: accountId });
  }, [open, accountId]);

  const filesQuery = useQuery<DriveFilesResponse, ApiError>({
    queryKey: ['gdrive', 'files', accountId],
    enabled: open && Boolean(accountId),
    queryFn: async () => {
      const res = await apiClient.get<DriveFilesResponse>('/integrations/gdrive/files', {
        params: { accountId, mimeFilter: 'all' },
      });
      return res.data;
    },
    retry: false,
  });

  const importer = useDriveImport({
    accountId,
    onReady: (file) => {
      const m = importingRef.current;
      importingRef.current = null;
      setImporting(null);
      if (m) {
        reportSignerEvent({
          type: 'mobile.gdrive.converted',
          account_id: accountId,
          mime_type: m.mimeType,
        });
      }
      onPick(file);
    },
  });

  // Lock body scroll while open — same pattern as MWBottomSheet.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC-to-close keyboard hook (web). Android back-button is handled by
  // the route stack — when this picker is rendered as part of /m/send
  // the navigation back-button collapses the dialog naturally.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const handleRowTap = (f: DriveFile): void => {
    reportSignerEvent({
      type: 'mobile.gdrive.file_selected',
      account_id: accountId,
      mime_type: f.mimeType,
    });
    importingRef.current = f;
    setImporting(f);
    importer.beginImport(f);
  };

  const status = statusOf(filesQuery.error);
  const isAuthError = status === 401;
  const isLoading = filesQuery.isLoading || filesQuery.isPending;
  const files = filesQuery.data?.files ?? [];

  let body: JSX.Element;
  if (isAuthError) {
    body = (
      <Empty>
        <StateTitle>Authorization expired</StateTitle>
        <StateText>Your Google connection needs to be re-authorized to continue.</StateText>
        <PrimaryAction
          type="button"
          onClick={() => {
            onReconnect?.();
          }}
        >
          Re-authorize
        </PrimaryAction>
      </Empty>
    );
  } else if (filesQuery.isError) {
    body = (
      <Empty>
        <StateTitle>Couldn&apos;t load Drive</StateTitle>
        <StateText>Something went wrong listing your files. Please try again.</StateText>
        <PrimaryAction type="button" onClick={() => filesQuery.refetch()}>
          Retry
        </PrimaryAction>
      </Empty>
    );
  } else if (isLoading) {
    body = (
      <ScrollList>
        <Skeleton aria-hidden />
        <Skeleton aria-hidden />
        <Skeleton aria-hidden />
      </ScrollList>
    );
  } else if (files.length === 0) {
    body = (
      <Empty>
        <StateTitle>No files in this folder</StateTitle>
        <StateText>You can pick a different account or upload from your phone instead.</StateText>
      </Empty>
    );
  } else {
    body = (
      <ScrollList>
        {files.map((f) => {
          const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
          const label = isFolder ? `Open folder ${f.name}` : `Import file ${f.name}`;
          return (
            <Row key={f.id} type="button" aria-label={label} onClick={() => handleRowTap(f)}>
              <RowIcon aria-hidden>
                {isFolder ? <Folder size={20} /> : <FileIcon size={20} />}
              </RowIcon>
              <RowText>
                <RowTitle>{f.name}</RowTitle>
                {f.modifiedTime && <RowSub>Modified {formatModified(f.modifiedTime)}</RowSub>}
              </RowText>
            </Row>
          );
        })}
      </ScrollList>
    );
  }

  return createPortal(
    <Backdrop role="dialog" aria-modal="true" aria-labelledby="mobile-drive-picker-title">
      <Surface>
        <Header>
          <IconButton type="button" onClick={onClose} aria-label="Close Drive picker">
            <X size={20} aria-hidden />
          </IconButton>
          <HeaderTitle id="mobile-drive-picker-title">My Drive</HeaderTitle>
          <span style={{ width: 44, flexShrink: 0 }} aria-hidden />
        </Header>
        {body}
        {importing && (
          <ImportingOverlay role="status" aria-live="polite">
            <Spinner aria-hidden />
            <StateTitle>Importing &lsquo;{importing.name}&rsquo;…</StateTitle>
            <StateText>Converting your file to PDF.</StateText>
          </ImportingOverlay>
        )}
      </Surface>
    </Backdrop>,
    document.body,
  );
}
