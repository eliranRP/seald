import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import { UploadPage } from '../pages/UploadPage';
import { SignersStepCard } from '../components/SignersStepCard';
import type { SignersStepSigner } from '../components/SignersStepCard';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { TemplatePickerDialog } from '../components/TemplatePickerDialog';
import { DrivePicker } from '../components/drive-picker';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { SIGNER_COLOR_PALETTE } from '../lib/mockApi/data/palette';
import { pickAvailableColor } from '../features/signers/pickAvailableColor';
import { usePdfDocument } from '../lib/pdf';
import { ConversionFailedDialog, ImportOverlay, useDriveImport } from '../features/gdriveImport';
import type { ImportPhase } from '../features/gdriveImport';
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

const TEMPLATE_QUERY_PARAM = 'template';

/**
 * Route wrapper around `UploadPage` that gates document creation on the
 * "add signers" dialog — the user must pick at least one signer before the
 * new document is created and routed to the editor.
 *
 * If the URL carries `?template=<id>` (set by `/templates/:id/use`'s
 * "Continue with this template" CTA), the route looks up the template,
 * shows a "Using template: <title>" banner, and after the uploaded PDF is
 * parsed projects the template's field layout onto the new document via
 * `resolveTemplateFields`. The pre-populated fields are written into the
 * draft so the editor renders them immediately. "Clear template" strips
 * the query arg and resets the pending field state.
 */
/**
 * Soft handshake from the templates wizard. When the user arrives via
 * `/templates/:id/use` Step 2 → Step 3, the wizard forwards the picked
 * PDF + signers via `location.state` so the editor can skip its own
 * upload screen and the signer dialog opens already populated. Each
 * field is optional — direct visits to `/document/new` from the nav
 * have no state and the route falls back to its standalone behavior.
 */
interface UploadRouteHandoffState {
  readonly pendingFile?: File;
  readonly templateSigners?: ReadonlyArray<AddSignerContact>;
  // Optional renamed title from the wizard. `string | undefined` (NOT
  // `string | null`) so it follows the project's exactOptionalPropertyTypes
  // convention — absent vs. present, no third "explicit null" form.
  readonly templateRename?: string;
}

export function UploadRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contacts, createDocument, addContact, updateDocument } = useAppState();
  const { user: authUser } = useAuth();
  const isGuest = authUser === null;

  // Capture the handoff payload exactly once on mount. We can't keep
  // re-deriving from `location.state`: the first useEffect below clears
  // it (so the browser doesn't try to re-apply a stale File on
  // back-then-forward), and any read after that returns null. If we
  // derived `templateSignersFromHandoff` from `location.state` directly,
  // it would flip true → false the moment the clear-state effect ran,
  // which would un-suppress the auto-open dialog and re-show the
  // signers picker right after the wizard already collected them
  // (the "signers display more than once" bug).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pdfFile, setPdfFile] = useState<File | null>(initialHandoff?.pendingFile ?? null);
  const [selectedSigners, setSelectedSigners] = useState<ReadonlyArray<AddSignerContact>>(
    () => initialHandoff?.templateSigners ?? [],
  );
  const { numPages } = usePdfDocument(pdfFile);

  /**
   * Live-subscribed list of templates. Drives the "Start from a
   * template" CTA in the dropzone — hidden when empty (per design)
   * and populated by `getTemplates()` once the seed/loader resolves.
   * The subscription stays mounted so a save in another tab/page
   * (e.g. "Save as template" on a finished envelope) shows up here
   * without a refresh.
   */
  const [templates, setTemplatesState] = useState<ReadonlyArray<TemplateSummary>>(getTemplates);
  useEffect(() => {
    return subscribeToTemplates(() => setTemplatesState(getTemplates()));
  }, []);
  // Hydrate the in-memory templates store from the server on mount.
  // Without this the "Start from a template" CTA stayed hidden for
  // anyone who landed on `/document/new` first — the store only got
  // populated as a side effect of visiting `/templates` (the only
  // other page that calls `listTemplates`). Soft-fail like
  // TemplatesListPage: guests + offline get the empty list and the
  // CTA simply stays hidden.
  useEffect(() => {
    const ac = new AbortController();
    listTemplates(ac.signal)
      .then((rows) => {
        setTemplates(rows);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[templates] list fetch failed:', err);
      });
    return () => ac.abort();
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Google Drive integration (WT-E). Hidden entirely when the feature
  // flag is off — the route renders no Drive surfaces at all so the
  // bundle still tree-shakes the modal/picker for users on the dark
  // build. When on, we read the connected accounts to drive the
  // disabled-vs-active CTA state on the source card.
  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const accounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = accounts[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const reconnectDrive = useReconnectGDrive();
  const handleConnectDrive = useCallback((): void => {
    connectDrive.mutate();
  }, [connectDrive]);
  // Wired into <DrivePicker onReconnect>. Picker-credentials returns 401
  // `token-expired` when the stored refresh token was revoked; without
  // this handler the picker silently opens + closes (Bug — user sees
  // the 401 in DevTools and nothing in the UI). With it, the OAuth
  // popup opens with prompt=consent so Google mints a fresh refresh
  // token; the user can retry the picker after authorizing.
  const handleReconnectDrive = useCallback((): void => {
    reconnectDrive.mutate();
  }, [reconnectDrive]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveImportPhase, setDriveImportPhase] = useState<ImportPhase | null>(null);
  const [driveImportFileName, setDriveImportFileName] = useState('');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const driveImport = useDriveImport({
    accountId: driveAccountId ?? '',
    onReady: (file) => {
      // Show "done" phase for 800ms before closing and handing off.
      setDriveImportPhase('done');
      doneTimerRef.current = setTimeout(() => {
        setDriveImportPhase(null);
        setPdfFile(file);
        setSelectedSigners([]);
      }, 800);
    },
  });

  // Clean up done timer on unmount.
  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  // Map driveImport.state to overlay phase.
  useEffect(() => {
    const { kind } = driveImport.state;
    if (kind === 'starting') {
      setDriveImportPhase('fetching');
      setDriveImportFileName(driveImport.state.file.name);
    } else if (kind === 'running') {
      setDriveImportPhase('converting');
    } else if (kind === 'failed') {
      setDriveImportPhase(null);
    }
    // `idle` is handled by onReady above (with 800ms done animation).
  }, [driveImport.state]);

  // The upload-page entry doesn't host its own "use this template"
  // experience — it only gates document creation on a PDF + signers.
  // Picking a template here therefore hands off to the canonical
  // `/templates/:id/use` flow (same destination as the TemplatesListPage
  // "Use" CTA), which handles "Continue with the saved example PDF" vs.
  // "Upload a new one" + signer collection before routing back to
  // `/document/new` with `?template=<id>` and (when applicable) the
  // location-state handoff. Stamping `?template=` from the picker on
  // `/document/new` would leave the user stuck behind the upload
  // dropzone with no way forward.
  const handlePickTemplate = useCallback(
    (picked: TemplateSummary): void => {
      setPickerOpen(false);
      navigate(`/templates/${encodeURIComponent(picked.id)}/use`);
    },
    [navigate],
  );

  // Resolve the template from the query arg (local lookup today;
  // TODO(api): swap for `GET /templates/:id` once the templates service
  // ships). `templateMissing` is true when a `?template=` arg is present
  // but doesn't match any known id — we surface a warning banner so the
  // sender knows the editor will start empty.
  const templateIdFromQuery = searchParams.get(TEMPLATE_QUERY_PARAM);
  const template: TemplateSummary | null = useMemo(() => {
    if (!templateIdFromQuery) return null;
    return findTemplateById(templateIdFromQuery) ?? null;
  }, [templateIdFromQuery]);
  const templateMissing = templateIdFromQuery !== null && template === null;

  /**
   * Once a templates-wizard handoff carries both signers AND a parsed
   * file, we want to skip the picker entirely and go straight to the
   * editor. Auto-confirm fires once numPages is known (or after a
   * 3s timeout if PDF.js fails to parse). The previous incarnation of
   * this hook also opened a popup-modal picker; that's gone now —
   * the inline `SignersStepCard` below replaces it.
   */
  const handoffHasSigners = (initialHandoff?.templateSigners?.length ?? 0) > 0;

  const handleFileSelected = useCallback((file: File) => {
    setPdfFile(file);
    setSelectedSigners([]);
    // The "Analyzing your document" loader plays automatically while
    // the PDF parses (`pdfFile && numPages <= 0` branch in render).
    // Once `numPages > 0`, the SignersStepCard takes over.
  }, []);

  const handleCreateContact = useCallback(
    (name: string, email: string) => {
      // Guest senders aren't authenticated, so the contacts API rejects
      // POST /contacts with 401. The previous implementation swallowed
      // that rejection silently, leaving the picker counter stuck at
      // "0 selected" with no signer ever added — the entire guest send
      // flow was unreachable. Mirror UseTemplatePage.createGuestSigner:
      // synthesize a local-only signer (no API round-trip) so the user
      // can keep moving. The signer is carried in `selectedSigners` and
      // pushed to the server later as part of the envelope POST when the
      // sender clicks "Send to sign".
      const synthLocalSigner = (): AddSignerContact => {
        // Pick the lowest-index palette color not already in use by the
        // current envelope roster. `prev.length % palette.length` reused
        // colors after a mid-list signer was removed; this walks the
        // palette and picks the first free entry instead.
        const used = [...contacts.map((c) => c.color), ...selectedSigners.map((s) => s.color)];
        return {
          id: `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          email,
          color: pickAvailableColor(SIGNER_COLOR_PALETTE, used),
        };
      };

      if (isGuest) {
        setSelectedSigners((prev) => {
          if (prev.some((s) => s.email.toLowerCase() === email.toLowerCase())) return prev;
          return [...prev, synthLocalSigner()];
        });
        return;
      }

      addContact(name, email)
        .then((created) => {
          setSelectedSigners((prev) => [...prev, created]);
        })
        .catch(() => {
          // Authenticated user but the contacts service is unreachable —
          // fall back to a local-only signer so the sender still finishes
          // the envelope. The contact won't be persisted to the address
          // book, but the envelope POST will still carry the signer.
          setSelectedSigners((prev) => {
            if (prev.some((s) => s.email.toLowerCase() === email.toLowerCase())) return prev;
            return [...prev, synthLocalSigner()];
          });
        });
    },
    [addContact, contacts, isGuest, selectedSigners],
  );

  const handleRemoveSelected = useCallback((id: string) => {
    setSelectedSigners((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pdfFile || selectedSigners.length === 0) return;
    const resolvedPages = Math.max(1, numPages);
    const id = createDocument(pdfFile, resolvedPages);

    // Pre-populate fields when the sender came from a template. Pages
    // that don't exist on the new PDF (e.g. layout asks for `page: 5`
    // on a 3-page upload) are filtered out by `resolveTemplateFields`;
    // we surface a console warning so the dropoff is observable.
    let pendingFields: ReturnType<typeof rebindFieldsToSigners> = [];
    if (template) {
      // Pass `lastSigners` so the resolver backfills `signerRoleId`
      // for legacy templates — keeps the rebind stable when the user
      // mid-list-removes a signer in the wizard.
      const resolved = resolveTemplateFields(template.fields, resolvedPages, template.lastSigners);
      pendingFields = rebindFieldsToSigners(resolved, selectedSigners);
      if (resolvedPages < template.pages) {
        // Use console.warn so the SPA's debug build flags the gap. The
        // banner already informs the user; this is for engineering.
        // eslint-disable-next-line no-console
        console.warn(
          `[templates] Uploaded PDF has ${resolvedPages} pages but template "${template.name}" was authored on ${template.pages}; some fields may have been skipped.`,
        );
      }
      // TODO(api): POST /templates/:id/use — bumps `uses_count` server-side
      // once the templates service lands. Today we just log; the local
      // `TEMPLATES` array is read-only seed data.
      // eslint-disable-next-line no-console
      console.info(`[templates] uses_count++ for ${template.id}`);
    }

    // `fromTemplateId` lets the editor render the contextual banner
    // and trigger the SendConfirmDialog when the user later sends.
    // `fromTemplateFreshUpload` flips when the user came in via the
    // wizard's "Upload a new one" branch (the saved layout adapted
    // to a different doc, vs. landing on the saved example).
    const cameFromUpload = initialHandoff?.pendingFile != null;
    updateDocument(id, {
      signers: selectedSigners.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
      })),
      ...(pendingFields.length > 0 ? { fields: pendingFields } : {}),
      ...(template ? { fromTemplateId: template.id } : {}),
      ...(template && cameFromUpload ? { fromTemplateFreshUpload: true } : {}),
    });
    setPdfFile(null);
    setSelectedSigners([]);
    navigate(`/document/${id}`);
  }, [
    pdfFile,
    selectedSigners,
    createDocument,
    updateDocument,
    numPages,
    navigate,
    template,
    initialHandoff?.pendingFile,
  ]);

  /**
   * Back from the SignersStepCard — drop the picked file + signers and
   * return to the upload dropzone. Called from the card's "Back" link
   * footer; previously this closed a modal dialog.
   */
  const handleCancelDialog = useCallback(() => {
    setPdfFile(null);
    setSelectedSigners([]);
  }, []);

  // When the templates wizard handed off both signers AND a parsed PDF,
  // skip the upload page + dialog entirely and drop the user straight
  // into the editor. The wizard already collected everything we need,
  // so the upload page would just be a flash of the analyzing loader
  // followed by an awkward "Where did my signers go?" if we let the
  // dialog gate this. We wait for `numPages > 0` because
  // `createDocument` needs the resolved page count to size the editor;
  // until then the user sees the analyzing spinner like a normal upload.
  // Use a ref guard so we only fire once even if React re-runs the
  // effect (e.g. handleConfirm bumping local state in a way that
  // re-triggers it before navigation lands).
  const handoffAutoConfirmedRef = useRef(false);
  useEffect(() => {
    if (handoffAutoConfirmedRef.current) return;
    if (!handoffHasSigners) return;
    if (!pdfFile) return;
    if (selectedSigners.length === 0) return;
    if (numPages <= 0) return;
    handoffAutoConfirmedRef.current = true;
    handleConfirm();
  }, [handoffHasSigners, pdfFile, selectedSigners, numPages, handleConfirm]);

  const handleClearTemplate = useCallback((): void => {
    // Strip the `template` arg only — preserve any other query params the
    // entry might one day carry. Also drop the in-progress file so the
    // sender starts from a clean slate; otherwise the dialog would still
    // be queued to open with no template-derived fields.
    const next = new URLSearchParams(searchParams);
    next.delete(TEMPLATE_QUERY_PARAM);
    setSearchParams(next, { replace: true });
    setPdfFile(null);
    setSelectedSigners([]);
  }, [searchParams, setSearchParams]);

  const bannerTitle = template
    ? template.name
    : templateMissing
      ? 'Template not found — starting empty'
      : undefined;
  const bannerTone: 'info' | 'warning' = templateMissing ? 'warning' : 'info';

  return (
    <>
      {/*
        Two-mode rendering: until the PDF is uploaded we show the
        UploadPage's drop surface; once it's parsed we swap to the same
        SignersStepCard the templates wizard uses. This unifies the
        signer-picking surface across the regular sign flow and the
        templates flow per operator feedback. The "Analyzing" loader
        still gets a brief moment to play if numPages is still 0 by the
        time the file lands.
      */}
      {!pdfFile || (pdfFile && numPages <= 0) ? (
        <UploadPage
          onFileSelected={handleFileSelected}
          status={pdfFile ? 'analyzing' : 'idle'}
          {...(pdfFile ? { analyzingFileName: pdfFile.name } : {})}
          {...(bannerTitle ? { templateBannerTitle: bannerTitle } : {})}
          templateBannerTone={bannerTone}
          {...(template || templateMissing ? { onClearTemplate: handleClearTemplate } : {})}
          {...(templates.length > 0 ? { onPickTemplate: () => setPickerOpen(true) } : {})}
          {...(gdriveOn && driveAccountId !== null
            ? { onPickDrive: () => setDrivePickerOpen(true) }
            : {})}
          {...(gdriveOn && driveAccountId === null ? { onConnectDrive: handleConnectDrive } : {})}
        />
      ) : (
        <SignersStepCard
          mode="new"
          // Envelope-flow copy — the signer flow at /document/new is
          // sending a real envelope, not authoring a template, so the
          // template-flavoured defaults baked into SignersStepCard
          // ("Pick the people who will fill this template.") are
          // overridden with envelope-appropriate language.
          heading="Who needs to sign this?"
          subtitle="Pick the people who'll fill out and sign this document."
          signers={selectedSigners.map(
            (c): SignersStepSigner => ({
              id: c.id,
              contactId: c.id,
              name: c.name,
              email: c.email,
              color: c.color,
            }),
          )}
          contacts={contacts}
          onPickContact={(contact) => {
            // Toggle: clicking an already-selected contact removes it
            // (matches the templates wizard's SignersStepCard semantics).
            setSelectedSigners((prev) => {
              const exists = prev.some((s) => s.id === contact.id);
              return exists ? prev.filter((s) => s.id !== contact.id) : [...prev, contact];
            });
          }}
          onCreateGuest={(name, email) => {
            handleCreateContact(name, email);
          }}
          onRemoveSigner={(id) => handleRemoveSelected(id)}
          onContinue={handleConfirm}
          onBack={handleCancelDialog}
          continueLabel="Continue to fields"
        />
      )}
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
        open={driveImportPhase !== null}
        phase={driveImportPhase ?? 'fetching'}
        fileName={driveImportFileName}
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
    </>
  );
}
