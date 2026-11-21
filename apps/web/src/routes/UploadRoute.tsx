import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import { UploadPage } from '../pages/UploadPage';
import { FlowHeader } from '../components/FlowHeader';
import type { DraftDocumentPart } from '../features/documentEditor/documents';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { TemplatePickerDialog } from '../components/TemplatePickerDialog';
import { DrivePicker } from '../components/drive-picker';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../lib/api/apiClient';
import { readIsMobileViewport } from '../hooks/useIsMobileViewport';
import { usePdfDocument } from '../lib/pdf';
import {
  ConversionFailedDialog,
  ImportOverlay,
  useDriveImportOverlay,
} from '../features/gdriveImport';
import {
  useConnectGDrive,
  useGDriveAccounts,
  useReconnectGDrive,
} from './settings/integrations/useGDriveAccounts';
import {
  findTemplateById,
  getTemplates,
  rebindFieldsToSigners,
  resolveTemplateFields,
  setTemplates,
  subscribeToTemplates,
  type TemplateSummary,
} from '../features/templates';
import { listTemplates } from '../features/templates/templatesApi';
import { buildDraftParts } from '../features/documentEditor/documents';
import { convertUploadToPdf, isWordFile } from '../features/documentEditor/upload/convertUpload';
import { makeMeSigner } from '../features/documentEditor/upload/meSigner';
import { TO_QUERY_PARAM, recipientFromQuery } from '../features/contacts/recipientFromQuery';

const TEMPLATE_QUERY_PARAM = 'template';
const GDRIVE_RETURN_PARAM = 'gdrive_connected';
const RECENT_TEMPLATE_COUNT = 3;

const Page = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
`;

const UPLOAD_STEPS = [
  { label: 'Upload', state: 'active' },
  { label: 'Prepare', state: 'todo' },
  { label: 'Send', state: 'todo' },
] as const;

/**
 * Soft handshake from the templates wizard. When the user arrives via
 * `/templates/:id/use` Step 2 → Step 3, the wizard forwards the picked
 * PDF + signers via `location.state` so the editor can skip its own
 * upload screen and open already populated. Each field is optional: direct
 * visits to `/document/new` from the nav have no state.
 */
interface UploadRouteHandoffState {
  readonly pendingFile?: File;
  readonly templateSigners?: ReadonlyArray<AddSignerContact>;
  // `string | undefined` (NOT `string | null`) so it follows the project's
  // exactOptionalPropertyTypes convention.
  readonly templateRename?: string;
}

/**
 * The server-side Word -> PDF conversion. `failed` keeps the file so
 * Retry can start it again; every rejection (Error or not) lands there,
 * so the spinner can never stick.
 */
type Conversion =
  | { readonly kind: 'idle' }
  | { readonly kind: 'converting'; readonly file: File }
  | { readonly kind: 'failed'; readonly file: File };

const NO_CONVERSION: Conversion = { kind: 'idle' };

/**
 * Route wrapper around `UploadPage`. Picking a file (PDF or Word, from the
 * computer, a template or Drive) analyses it and opens the editor with the
 * sender already on the signer list: signers are chosen in the editor, not
 * before it.
 *
 * Word files are converted to PDF on the server first. If the URL carries
 * `?template=<id>` (set by `/templates/:id/use`), the template's field
 * layout is projected onto the new document once the PDF is parsed.
 */
export function UploadRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { createDocument, updateDocument, contacts } = useAppState();
  const { user: authUser } = useAuth();

  // Capture the handoff payload exactly once on mount. The effect below
  // clears `location.state` so the browser does not re-apply a stale File on
  // back-then-forward; any later read would return null.
  const [initialHandoff] = useState<UploadRouteHandoffState | null>(
    () => (location.state ?? null) as UploadRouteHandoffState | null,
  );
  useEffect(() => {
    if (initialHandoff && (initialHandoff.pendingFile || initialHandoff.templateSigners)) {
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null },
      );
    }
    // run once on mount; the clear-state effect must not chase
    // `location` updates or it would loop.
  }, []);

  // Multi-document envelopes (flag `multiDocumentEnvelopes`). With the flag
  // off the dropzone takes one file and `extraFiles` is always empty.
  const multiDoc = isFeatureEnabled('multiDocumentEnvelopes');
  const [pdfFile, setPdfFile] = useState<File | null>(initialHandoff?.pendingFile ?? null);
  const [extraFiles, setExtraFiles] = useState<ReadonlyArray<File>>([]);
  const [conversion, setConversion] = useState<Conversion>(NO_CONVERSION);
  const convertAbort = useRef<AbortController | null>(null);
  const { numPages, error: pdfError } = usePdfDocument(pdfFile);

  /** Live-subscribed templates: drive the Template tile and recent chips. */
  const [templates, setTemplatesState] = useState<ReadonlyArray<TemplateSummary>>(getTemplates);
  useEffect(() => {
    return subscribeToTemplates(() => setTemplatesState(getTemplates()));
  }, []);
  // Hydrate the in-memory store from the server so the tile shows for
  // anyone who lands here first. Soft-fail: guests and offline get none.
  useEffect(() => {
    const ac = new AbortController();
    listTemplates(ac.signal)
      .then((rows) => {
        setTemplates(rows);
      })
      .catch((err) => {
        console.warn('[templates] list fetch failed:', err);
      });
    return () => ac.abort();
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Google Drive integration. Hidden entirely when the feature flag is off.
  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const accounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = accounts[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const reconnectDrive = useReconnectGDrive();
  const handleConnectDrive = useCallback((): void => {
    if (readIsMobileViewport()) {
      // iOS Safari blocks the OAuth popup: full-page redirect instead. The
      // API sends the phone back through `/m/send/drive` to this screen.
      apiClient
        .get<{ url: string }>(
          `/integrations/gdrive/oauth/url?return=${encodeURIComponent('/m/send/drive')}`,
        )
        .then((res) => {
          window.location.href = res.data.url;
        })
        .catch(() => undefined);
      return;
    }
    connectDrive.mutate();
  }, [connectDrive]);
  // Picker-credentials returns 401 `token-expired` when the stored refresh
  // token was revoked; the OAuth popup (prompt=consent) mints a fresh one.
  const handleReconnectDrive = useCallback((): void => {
    reconnectDrive.mutate();
  }, [reconnectDrive]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  // Back from Google's consent on a phone (`/m/send/drive` forwards here):
  // open the Drive picker once the new account has loaded, then drop the arg.
  const returnedFromDrive = searchParams.get(GDRIVE_RETURN_PARAM) === '1';
  useEffect(() => {
    if (!returnedFromDrive || !gdriveOn || driveAccountId === null) return;
    setDrivePickerOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete(GDRIVE_RETURN_PARAM);
    setSearchParams(next, { replace: true });
  }, [returnedFromDrive, gdriveOn, driveAccountId, searchParams, setSearchParams]);
  // Drive import: overlay phase and the 800 ms "done" hand-off.
  const driveImport = useDriveImportOverlay({
    accountId: driveAccountId ?? '',
    onFile: setPdfFile,
  });

  useEffect(() => {
    return () => {
      convertAbort.current?.abort();
    };
  }, []);

  // Picking a template hands off to the canonical `/templates/:id/use`
  // flow (same destination as the Templates list "Use" CTA), which handles
  // "saved example" vs. "upload a new one" before routing back here.
  const handlePickTemplate = useCallback(
    (picked: TemplateSummary): void => {
      setPickerOpen(false);
      navigate(`/templates/${encodeURIComponent(picked.id)}/use`);
    },
    [navigate],
  );

  const templateIdFromQuery = searchParams.get(TEMPLATE_QUERY_PARAM);
  const template: TemplateSummary | null = useMemo(() => {
    if (!templateIdFromQuery) return null;
    return findTemplateById(templateIdFromQuery) ?? null;
  }, [templateIdFromQuery]);
  const templateMissing = templateIdFromQuery !== null && template === null;

  const { cancel: cancelDriveImport } = driveImport;
  const resetFiles = useCallback((): void => {
    convertAbort.current?.abort();
    convertAbort.current = null;
    cancelDriveImport();
    setPdfFile(null);
    setExtraFiles([]);
    setConversion(NO_CONVERSION);
  }, [cancelDriveImport]);

  const startConversion = useCallback((word: File): void => {
    convertAbort.current?.abort();
    const ac = new AbortController();
    convertAbort.current = ac;
    setConversion({ kind: 'converting', file: word });
    convertUploadToPdf(word, ac.signal)
      .then((pdf) => {
        if (ac.signal.aborted) return;
        setConversion(NO_CONVERSION);
        setPdfFile(pdf);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setConversion({ kind: 'failed', file: word });
      });
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      // A local pick wins over a Drive import still running or in its
      // "done" window.
      cancelDriveImport();
      setExtraFiles([]);
      if (isWordFile(file)) {
        setPdfFile(null);
        startConversion(file);
        return;
      }
      convertAbort.current?.abort();
      convertAbort.current = null;
      setConversion(NO_CONVERSION);
      setPdfFile(file);
    },
    [cancelDriveImport, startConversion],
  );

  const handleFilesSelected = useCallback(
    (files: ReadonlyArray<File>) => {
      const [first, ...rest] = files;
      if (!first) return;
      handleFileSelected(first);
      setExtraFiles(rest);
    },
    [handleFileSelected],
  );

  const confirmWith = useCallback(
    (extraParts: ReadonlyArray<DraftDocumentPart>) => {
      if (!pdfFile) return;
      const resolvedPages = Math.max(1, numPages);
      const id = createDocument(pdfFile, resolvedPages);

      // Signers: the wizard's roster when it handed one over, otherwise just
      // the sender ("Me"); everyone else is added in the editor. Guests have
      // no identity yet, so they start with an empty list.
      const handoffSigners = initialHandoff?.templateSigners ?? [];
      const hasIdentity = authUser !== null && authUser.email.length > 0;
      let signers: ReadonlyArray<AddSignerContact> = [];
      if (handoffSigners.length > 0) signers = handoffSigners;
      else if (authUser !== null && hasIdentity) signers = [makeMeSigner(authUser)];

      // `?to=<email>` (Contacts → Send): the person is already on the list.
      const toSigner = recipientFromQuery(searchParams.get(TO_QUERY_PARAM), contacts, signers);
      if (toSigner) signers = [...signers, toSigner];

      // Pre-populate fields when the sender came from a template. Pages that
      // don't exist on the new PDF are filtered out by `resolveTemplateFields`.
      let pendingFields: ReturnType<typeof rebindFieldsToSigners> = [];
      if (template) {
        const resolved = resolveTemplateFields(
          template.fields,
          resolvedPages,
          template.lastSigners,
        );
        pendingFields = rebindFieldsToSigners(resolved, signers);
        if (resolvedPages < template.pages) {
          console.warn(
            `[templates] Uploaded PDF has ${resolvedPages} pages but template "${template.name}" was authored on ${template.pages}; some fields may have been skipped.`,
          );
        }
        // TODO(api): POST /templates/:id/use bumps `uses_count` server-side.
        console.info(`[templates] uses_count++ for ${template.id}`);
      }

      const cameFromUpload = initialHandoff?.pendingFile != null;
      updateDocument(id, {
        signers: signers.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          color: s.color,
        })),
        ...(pendingFields.length > 0 ? { fields: pendingFields } : {}),
        ...(template ? { fromTemplateId: template.id } : {}),
        ...(template && cameFromUpload ? { fromTemplateFreshUpload: true } : {}),
        ...(extraParts.length > 1 ? { documents: extraParts } : {}),
      });
      setPdfFile(null);
      setExtraFiles([]);
      navigate(`/document/${id}`);
    },
    [
      pdfFile,
      numPages,
      createDocument,
      updateDocument,
      navigate,
      template,
      authUser,
      contacts,
      searchParams,
      initialHandoff?.templateSigners,
      initialHandoff?.pendingFile,
    ],
  );

  const handleConfirm = useCallback(() => {
    if (!multiDoc || !pdfFile || extraFiles.length === 0) {
      confirmWith([]);
      return;
    }
    // Several PDFs: read each one's page count and size first, then carry
    // them all into the draft. A file that does not parse is left out.
    buildDraftParts([pdfFile, ...extraFiles])
      .then(({ parts, failed }) => {
        if (failed.length > 0) {
          console.warn(`[upload] skipped unreadable PDFs: ${failed.join(', ')}`);
        }
        confirmWith(parts);
      })
      .catch(() => confirmWith([]));
  }, [confirmWith, extraFiles, multiDoc, pdfFile]);

  // Once the PDF is parsed there is nothing left to ask: open the editor.
  // The ref guard fires once per picked file even if the effect re-runs.
  const confirmedFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (!pdfFile || numPages <= 0) return;
    if (confirmedFileRef.current === pdfFile) return;
    confirmedFileRef.current = pdfFile;
    handleConfirm();
  }, [pdfFile, numPages, handleConfirm]);

  // A PDF that cannot be parsed would spin forever: show the failure card.
  const analysisFailed = pdfFile !== null && pdfError !== null;

  const handleClearTemplate = useCallback((): void => {
    // Strip the `template` arg only; preserve any other query params.
    const next = new URLSearchParams(searchParams);
    next.delete(TEMPLATE_QUERY_PARAM);
    setSearchParams(next, { replace: true });
    resetFiles();
  }, [resetFiles, searchParams, setSearchParams]);

  const handleRetryConversion = useCallback((): void => {
    if (conversion.kind === 'idle') resetFiles();
    else startConversion(conversion.file);
  }, [conversion, resetFiles, startConversion]);

  let bannerTitle: string | undefined;
  if (template) bannerTitle = template.name;
  else if (templateMissing) bannerTitle = 'Template not found — starting empty';
  const bannerTone: 'info' | 'warning' = templateMissing ? 'warning' : 'info';

  const activeFile = conversion.kind === 'idle' ? pdfFile : conversion.file;
  let status: 'idle' | 'analyzing' | 'converting' = 'idle';
  if (conversion.kind !== 'idle') status = 'converting';
  else if (pdfFile) status = 'analyzing';
  const recent = templates.slice(0, RECENT_TEMPLATE_COUNT).map((t) => ({
    id: t.id,
    name: t.name,
    signers: t.lastSigners?.length,
  }));

  return (
    <Page>
      <FlowHeader
        steps={UPLOAD_STEPS}
        onClose={() => navigate('/documents')}
        closeLabel="Back to documents"
        mobileTitle="New document"
      />
      <UploadPage
        allowWord
        showSources
        onFileSelected={handleFileSelected}
        {...(multiDoc ? { multiple: true, onFilesSelected: handleFilesSelected } : {})}
        status={status}
        {...(activeFile
          ? { analyzingFileName: activeFile.name, analyzingFileSize: activeFile.size }
          : {})}
        {...(pdfFile && numPages > 0 ? { analyzedPages: numPages } : {})}
        conversionFailed={conversion.kind === 'failed' || analysisFailed}
        onCancelAnalysis={resetFiles}
        onRetryConversion={handleRetryConversion}
        {...(bannerTitle ? { templateBannerTitle: bannerTitle } : {})}
        templateBannerTone={bannerTone}
        {...(template || templateMissing ? { onClearTemplate: handleClearTemplate } : {})}
        {...(templates.length > 0
          ? {
              onPickTemplate: () => setPickerOpen(true),
              templateCount: templates.length,
              recentTemplates: recent,
              onPickRecentTemplate: (id: string) =>
                navigate(`/templates/${encodeURIComponent(id)}/use`),
            }
          : {})}
        onScan={() => navigate('/scan')}
        {...(gdriveOn && driveAccountId !== null
          ? { onPickDrive: () => setDrivePickerOpen(true) }
          : {})}
        {...(gdriveOn && driveAccountId === null ? { onConnectDrive: handleConnectDrive } : {})}
      />
      <TemplatePickerDialog
        open={pickerOpen}
        templates={templates}
        onPick={handlePickTemplate}
        onClose={() => setPickerOpen(false)}
      />
      {gdriveOn && driveAccountId !== null ? (
        <DrivePicker
          open={drivePickerOpen}
          accountId={driveAccountId}
          onClose={() => setDrivePickerOpen(false)}
          onReconnect={handleReconnectDrive}
          onPick={(file) => {
            setDrivePickerOpen(false);
            driveImport.beginImport(file);
          }}
        />
      ) : null}
      <ImportOverlay
        open={driveImport.phase !== null}
        phase={driveImport.phase ?? 'fetching'}
        fileName={driveImport.fileName}
      />
      <ConversionFailedDialog
        open={driveImport.state.kind === 'failed'}
        errorCode={
          driveImport.state.kind === 'failed' ? driveImport.state.error : 'conversion-failed'
        }
        onRetry={() => {
          driveImport.reset();
          setDrivePickerOpen(true);
        }}
        onClose={() => driveImport.reset()}
      />
    </Page>
  );
}
