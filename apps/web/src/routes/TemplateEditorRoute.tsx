import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { DocumentPage } from '../pages/DocumentPage';
import { TemplateFlowHeader } from '../components/TemplateFlowHeader';
import { TemplateModeBanner } from '../components/TemplateModeBanner';
import { Toast } from '../components/Toast';
import { SendConfirmDialog } from '../components/SendConfirmDialog';
import { ExitConfirmDialog } from '../components/ExitConfirmDialog';
import { SendingOverlay } from '../components/SendingOverlay';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';
import { usePdfDocument } from '../lib/pdf';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { useSendEnvelope } from '../features/envelopes';
import type { FieldKind, FieldPlacement } from '../features/envelopes';
import {
  deriveTemplateFieldLayout,
  findTemplateById,
  getTemplates,
  rebindFieldsToSigners,
  resolveTemplateFields,
  setTemplates,
  subscribeToTemplates,
} from '../features/templates';
import {
  createTemplate,
  fetchTemplateExamplePdf,
  listTemplates,
  updateTemplate,
  uploadTemplateExamplePdf,
} from '../features/templates/templatesApi';
import type { TemplateSummary } from '../features/templates';

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 740;

// Fields available in the templates flow. Email isn't supported by
// templates (the saved layout has no signer-specific email plumbing),
// so we strip it out of the palette here even though the underlying
// editor surface accepts it for the regular sign flow.
const TEMPLATE_FIELD_KINDS: ReadonlyArray<FieldKind> = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
];

const DEFAULT_PX: Record<FieldKind, { readonly w: number; readonly h: number }> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
};

interface TemplateEditorHandoffState {
  readonly pendingFile?: File;
  readonly templateSigners?: ReadonlyArray<AddSignerContact>;
  readonly templateRename?: string;
}

/**
 * Fills the AppShell's `Content` slot below the global NavBar. We use
 * `flex: 1 1 auto` + `min-height: 0` rather than `height: 100vh` so
 * the rail footer can stick to the bottom of the viewport-minus-nav
 * area (NavBar already consumes the top of the viewport). `overflow:
 * hidden` keeps the canvas scroll confined to the editor's CanvasScroll.
 */
const Page = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/**
 * Wrapper around the DocumentPage so it can flex inside the Page. The
 * DocumentPage's own Shell uses `flex: 1 1 auto` + `min-height: 0`, so
 * we mirror that here so the canvas + rails get the remaining height
 * after the TemplateFlowHeader.
 */
const PageBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

/**
 * Step 3 of the templates wizard. Replaces the global app NavBar with
 * the TemplateFlowHeader (Back / mode pill / template name / step
 * pills / cancel) — the entire flow from Step 1 → Step 3 shares a
 * single chrome surface, matching the design guide.
 *
 * Two operating modes:
 *
 *   `mode='new'`     — the sender is creating a brand-new template.
 *                      Right rail shows a TEMPLATE summary card
 *                      instead of the signers panel; primary CTA is
 *                      "Save as template" (purple). Banner is the
 *                      success copy "Last step — place fields, then
 *                      save as template".
 *
 *   `mode='using'`   — the sender opened a saved template, optionally
 *                      swapped in a fresh PDF. Saved layout snaps onto
 *                      the doc via resolveTemplateFields. Right rail
 *                      shows the regular Signers + Fields panels;
 *                      primary CTA is "Send to sign". Banner is the
 *                      info copy "Saved layout loaded/adapted".
 *
 * `mode='editing'` is treated as `'using'` for the editor surface —
 * the difference is purely in the FlowHeader pill.
 */
export function TemplateEditorRoute() {
  const params = useParams<{ readonly id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, contacts, getDocument, createDocument, updateDocument, addContact, sendDocument } =
    useAppState();
  const { guest } = useAuth();
  const sendEnvelope = useSendEnvelope();

  const decodedId = decodeURIComponent(params.id ?? '');
  const isNewTemplate = decodedId === 'new';
  // Subscribe to the templates store so deep-link / hard-reload paths
  // pick up the canonical record once the API hydration finishes.
  // Without this `sourceTemplate.hasExamplePdf` would stay undefined
  // on first render and the example-PDF fetch effect below would
  // never fire (issue #4 v2 regression).
  const templates = useSyncExternalStore<ReadonlyArray<TemplateSummary>>(
    subscribeToTemplates,
    getTemplates,
    getTemplates,
  );
  const sourceTemplate = useMemo<TemplateSummary | undefined>(
    () =>
      isNewTemplate
        ? undefined
        : (templates.find((t) => t.id === decodedId) ?? findTemplateById(decodedId)),
    [decodedId, isNewTemplate, templates],
  );
  const mode: 'new' | 'using' | 'editing' = isNewTemplate
    ? 'new'
    : searchParams.get('mode') === 'edit'
      ? 'editing'
      : 'using';

  // Read the wizard handoff (file + signers + optional rename) from
  // location.state once on mount. Same lifecycle reasoning as
  // UploadRoute: clearing it after consumption prevents stale Files
  // from re-applying on browser back/forward.
  const [initialHandoff] = useState<TemplateEditorHandoffState | null>(
    () => (location.state ?? null) as TemplateEditorHandoffState | null,
  );
  useEffect(() => {
    if (initialHandoff && (initialHandoff.pendingFile || initialHandoff.templateSigners)) {
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local draft id — created lazily once we know the page count.
  const [draftId, setDraftId] = useState<string | null>(null);
  const draft = draftId ? getDocument(draftId) : undefined;

  /**
   * Saved example PDF fetched from the API when the user picks a
   * template that has `hasExamplePdf`. Stored as state so the
   * usePdfDocument hook can re-parse once the bytes arrive. `null`
   * until either (a) the fetch completes successfully or (b) we're
   * not in saved-doc mode.
   */
  const [fetchedExampleFile, setFetchedExampleFile] = useState<File | null>(null);
  /**
   * "We've stopped trying to fetch the example PDF" flag. Flips to
   * `true` whether the fetch succeeded, failed, or 404'd. The
   * bootstrap effect uses this to know it can stop waiting and fall
   * through to the placeholder, so a network failure doesn't
   * permanently freeze the editor on the saved-doc branch.
   */
  const [examplePdfFetchSettled, setExamplePdfFetchSettled] = useState(false);

  /**
   * Hydrate the templates module store on mount when it's empty and
   * we're not authoring a brand-new template. Without this a user
   * who deep-links / hard-reloads `/templates/:id/edit` lands with
   * an empty store, `sourceTemplate` stays undefined, the example-
   * PDF fetch effect never fires, and the bootstrap stalls. Mirrors
   * the same idempotent listTemplates() call TemplatesListPage runs
   * on its own mount.
   */
  useEffect(() => {
    if (isNewTemplate) return undefined;
    if (templates.length > 0) return undefined;
    const controller = new AbortController();
    void listTemplates(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setTemplates(rows);
      })
      .catch(() => {
        // Quiet failure — the editor will fall through to the
        // not-found surface if the template still can't be resolved.
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewTemplate]);

  const fileForParse = draft?.file ?? initialHandoff?.pendingFile ?? fetchedExampleFile ?? null;
  const { doc: pdfDoc, numPages, loading: pdfLoading } = usePdfDocument(fileForParse);

  /**
   * Saved-doc branch (no pendingFile, sourceTemplate exists, no example
   * PDF stored server-side): we have no PDF blob to parse — the
   * template only stored a layout. Synthesize a 1-byte placeholder
   * File so `createDocument` accepts it; the page count comes from
   * the source template's authored count, and the editor renders a
   * blank N-page canvas the user can place fields on. This is the
   * fallback when migration 0010 hasn't been applied or the original
   * upload happened before example-PDF storage existed.
   */
  const placeholderFile = useMemo<File | null>(() => {
    if (initialHandoff?.pendingFile) return null;
    if (!sourceTemplate) return null;
    // While the example-PDF fetch is in flight, suppress the
    // placeholder so the bootstrap-wait branch can do its job. Once
    // the fetch settles (success OR failure), fall through to the
    // placeholder if no real bytes arrived — that keeps the editor
    // usable even when the saved PDF can't be fetched.
    if (sourceTemplate.hasExamplePdf && !examplePdfFetchSettled) return null;
    if (sourceTemplate.hasExamplePdf && fetchedExampleFile) return null;
    const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: 'application/pdf',
    });
    return new File([blob], sourceTemplate.exampleFile || `${sourceTemplate.name}.pdf`, {
      type: 'application/pdf',
    });
  }, [initialHandoff?.pendingFile, sourceTemplate, examplePdfFetchSettled, fetchedExampleFile]);

  /**
   * Fetch the example PDF once when the user reuses a saved template
   * that has one stored. Aborts on unmount / template change so a
   * stale response can't overwrite a newer fetch. Failures fall
   * through silently — the placeholder branch above renders the blank
   * canvas so the editor remains usable even if the bytes can't be
   * downloaded right now.
   */
  useEffect(() => {
    if (initialHandoff?.pendingFile) return undefined;
    if (!sourceTemplate?.hasExamplePdf) return undefined;
    const controller = new AbortController();
    setExamplePdfFetchSettled(false);
    void fetchTemplateExamplePdf(sourceTemplate.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        const filename = sourceTemplate.exampleFile || `${sourceTemplate.name}.pdf`;
        setFetchedExampleFile(new File([blob], filename, { type: 'application/pdf' }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Server may be unreachable or return 404 mid-flight. We log
        // a console.warn so devs can see the failure and fall
        // through to the placeholder canvas (the route stays usable
        // for editing — saving will still re-upload).
        console.warn('[templates] example PDF fetch failed; using placeholder:', err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setExamplePdfFetchSettled(true);
      });
    return () => controller.abort();
  }, [
    initialHandoff?.pendingFile,
    sourceTemplate?.hasExamplePdf,
    sourceTemplate?.id,
    sourceTemplate?.exampleFile,
    sourceTemplate?.name,
  ]);

  // Once the PDF parses (or we have a placeholder + a sourceTemplate),
  // bootstrap a local draft entry: createDocument + seed signers +
  // project the saved template's field layout onto the page count.
  useEffect(() => {
    if (draftId) return;

    // Wait for the example-PDF fetch to SETTLE (success or failure)
    // before locking in the draft when the template advertises one.
    // The placeholder would otherwise win the bootstrap race and
    // `draft.file` would never be replaced when the real bytes
    // arrive. If the fetch fails the settled flag still flips so
    // the route doesn't freeze (issue #4 v3).
    if (sourceTemplate?.hasExamplePdf && !examplePdfFetchSettled && !initialHandoff?.pendingFile) {
      return;
    }

    // Effective file + page count. Real parsed file takes precedence;
    // saved-doc branch falls back to the placeholder + source template
    // page count so we don't block on PDF.js for a doc we can't parse.
    const file = fileForParse ?? placeholderFile;
    if (!file) return;
    let resolvedPages = numPages;
    if (resolvedPages <= 0) {
      if (sourceTemplate && file === placeholderFile) {
        // Saved-doc branch with a placeholder: trust the template's
        // authored page count, but clamp to ≥1 so the editor canvas
        // always has something to render even when the source was
        // saved with a missing/zero page count.
        resolvedPages = Math.max(1, sourceTemplate.pages || 1);
      } else {
        return;
      }
    }

    const id = createDocument(file, resolvedPages);
    setDraftId(id);

    const signersFromHandoff = initialHandoff?.templateSigners ?? [];
    const signers = signersFromHandoff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      color: s.color,
    }));

    let pendingFields: ReadonlyArray<PlacedFieldValue> = [];
    if (sourceTemplate) {
      const resolved = resolveTemplateFields(sourceTemplate.fields, resolvedPages);
      // Apply the user-spec signer-count rules: bind by ordinal, drop
      // fields whose owning signer was removed, fall back to signers[0]
      // only for legacy (pre-signerIndex) templates. Centralized in
      // `rebindFieldsToSigners` so UploadRoute and this route share the
      // exact same semantics. See `rebindFieldsToSigners.test.ts` for
      // the regression cases tied to bug #2.
      pendingFields = rebindFieldsToSigners(resolved, signers);
    }

    updateDocument(id, {
      signers,
      ...(pendingFields.length > 0 ? { fields: pendingFields } : {}),
      ...(sourceTemplate ? { fromTemplateId: sourceTemplate.id } : {}),
      ...(sourceTemplate && !initialHandoff?.pendingFile
        ? {}
        : sourceTemplate
          ? { fromTemplateFreshUpload: true }
          : {}),
    });
  }, [
    draftId,
    fileForParse,
    placeholderFile,
    numPages,
    createDocument,
    updateDocument,
    initialHandoff?.templateSigners,
    initialHandoff?.pendingFile,
    sourceTemplate,
    fetchedExampleFile,
    examplePdfFetchSettled,
  ]);

  // ---- Editor state ----------------------------------------------------
  const [renamedTitle, setRenamedTitle] = useState<string | null>(
    () => initialHandoff?.templateRename ?? null,
  );
  const [bannerOpen, setBannerOpen] = useState(true);
  const [exitOpen, setExitOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{
    readonly title: string;
    readonly subtitle?: string | undefined;
    readonly tone: 'success' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const headerTitle = renamedTitle ?? sourceTemplate?.name ?? 'New template';

  // ---- Field/signer mutations (proxied to AppState updateDocument) -----

  const handleFieldsChange = useCallback(
    (next: ReadonlyArray<PlacedFieldValue>) => {
      if (!draft) return;
      updateDocument(draft.id, { fields: next });
    },
    [draft, updateDocument],
  );

  const handleAddSignerFromContact = useCallback(
    (contact: AddSignerContact) => {
      if (!draft) return;
      if (draft.signers.some((s) => s.id === contact.id)) return;
      updateDocument(draft.id, {
        signers: [
          ...draft.signers,
          { id: contact.id, name: contact.name, email: contact.email, color: contact.color },
        ],
      });
    },
    [draft, updateDocument],
  );

  const handleCreateSigner = useCallback(
    (name: string, email: string) => {
      if (!draft) return;
      addContact(name, email)
        .then((created) => {
          updateDocument(draft.id, {
            signers: [
              ...draft.signers,
              { id: created.id, name: created.name, email: created.email, color: created.color },
            ],
          });
        })
        .catch(() => {
          /* swallowed */
        });
    },
    [draft, addContact, updateDocument],
  );

  const handleRemoveSigner = useCallback(
    (id: string) => {
      if (!draft) return;
      updateDocument(draft.id, {
        signers: draft.signers.filter((s) => s.id !== id),
        fields: draft.fields.map((f) =>
          f.signerIds.includes(id)
            ? { ...f, signerIds: f.signerIds.filter((sid) => sid !== id) }
            : f,
        ),
      });
    },
    [draft, updateDocument],
  );

  const renameTemplate = useCallback((next: string) => setRenamedTitle(next), []);

  // ---- Save-as-template (new mode primary) -----------------------------

  const handleSaveAsTemplate = useCallback(async () => {
    if (!draft) return;
    const title = (renamedTitle ?? sourceTemplate?.name ?? 'Untitled template').trim();
    try {
      // Pass the live signer roster so each saved field records its
      // owning signer's ordinal — see `TemplateField.signerIndex`. On
      // reuse, fields are rebound to the same ordinal so per-signer
      // colors and assignments survive the round-trip.
      const fieldLayout = deriveTemplateFieldLayout(draft.fields, draft.totalPages, draft.signers);
      // Capture the current signer roster as `last_signers` so the
      // next user of this template starts with the same recipients
      // pre-filled. Previously this was only persisted in
      // `handleSendAndUpdate`, so brand-new templates saved without
      // sending lost their roster — see UseTemplatePage's pre-fill
      // effect (reads `template.lastSigners`).
      const lastSigners = draft.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
      }));
      let savedId: string;
      if (sourceTemplate) {
        const updated = await updateTemplate(sourceTemplate.id, {
          title,
          field_layout: fieldLayout,
          last_signers: lastSigners,
        });
        setTemplates(getTemplates().map((t) => (t.id === updated.id ? updated : t)));
        savedId = updated.id;
      } else {
        const created = await createTemplate({
          title,
          field_layout: fieldLayout,
          cover_color: '#EEF2FF',
          last_signers: lastSigners,
        });
        setTemplates([created, ...getTemplates()]);
        savedId = created.id;
      }
      // Persist the example PDF alongside the layout when the user
      // uploaded one in this session. Reuse triggers fetch-on-open
      // (effect above) so a future "Use this template" can re-render
      // the original document instead of the placeholder canvas.
      if (draft.file) {
        try {
          const updated = await uploadTemplateExamplePdf(savedId, draft.file);
          setTemplates(getTemplates().map((t) => (t.id === updated.id ? updated : t)));
        } catch {
          // Upload failure is non-fatal — the template row was
          // already saved. The user just won't see the original PDF
          // on next open; the placeholder canvas takes over.
        }
      }
      setToast({
        title: 'Template saved',
        subtitle: 'Reuse it any time from the templates list.',
        tone: 'success',
      });
      window.setTimeout(() => navigate('/templates'), 700);
    } catch (err) {
      setToast({
        title: 'Save failed',
        subtitle: err instanceof Error ? err.message : 'Failed to save template. Please try again.',
        tone: 'error',
      });
    }
  }, [draft, renamedTitle, sourceTemplate, navigate]);

  // ---- Send-to-sign (using mode primary) -------------------------------

  const toNormalized = useCallback(
    (field: PlacedFieldValue): Pick<FieldPlacement, 'x' | 'y' | 'width' | 'height'> => {
      const widthPx = field.width ?? DEFAULT_PX[field.type as FieldKind]?.w ?? DEFAULT_PX.text.w;
      const heightPx = field.height ?? DEFAULT_PX[field.type as FieldKind]?.h ?? DEFAULT_PX.text.h;
      return {
        x: Math.max(0, Math.min(1, field.x / CANVAS_WIDTH)),
        y: Math.max(0, Math.min(1, field.y / CANVAS_HEIGHT)),
        width: Math.max(0, Math.min(1, widthPx / CANVAS_WIDTH)),
        height: Math.max(0, Math.min(1, heightPx / CANVAS_HEIGHT)),
      };
    },
    [],
  );

  const runSend = useCallback(async () => {
    if (!draft || !draft.file) return;
    setSendError(null);
    if (guest) {
      sendDocument(draft.id);
      navigate(`/document/${draft.id}/sent`);
      return;
    }
    try {
      const result = await sendEnvelope.run({
        title: draft.title,
        file: draft.file,
        signers: draft.signers.map((s) => ({ contactId: s.id })),
        buildFields: (contactIdToSignerId) => {
          const out: FieldPlacement[] = [];
          for (const f of draft.fields) {
            const normalized = toNormalized(f);
            for (const localSignerId of f.signerIds) {
              const serverSignerId = contactIdToSignerId.get(localSignerId);
              if (serverSignerId) {
                const placement: FieldPlacement = {
                  signer_id: serverSignerId,
                  kind: f.type as FieldKind,
                  page: f.page,
                  x: normalized.x,
                  y: normalized.y,
                  required: f.required ?? true,
                  ...(normalized.width !== undefined ? { width: normalized.width } : {}),
                  ...(normalized.height !== undefined ? { height: normalized.height } : {}),
                  ...(f.linkId ? { link_id: f.linkId } : {}),
                };
                out.push(placement);
              }
            }
          }
          return out;
        },
      });
      sendDocument(draft.id);
      navigate(`/document/${result.envelope_id}/sent`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to send the document.');
    }
  }, [draft, guest, navigate, sendDocument, sendEnvelope, toNormalized]);

  const handleSend = useCallback(() => {
    if (sourceTemplate) {
      setSendConfirmOpen(true);
      return;
    }
    runSend().catch(() => {});
  }, [sourceTemplate, runSend]);

  const handleSendJust = useCallback(() => {
    setSendConfirmOpen(false);
    runSend().catch(() => {});
  }, [runSend]);

  const handleSendAndUpdate = useCallback(() => {
    setSendConfirmOpen(false);
    if (sourceTemplate && draft) {
      const fieldLayout = deriveTemplateFieldLayout(draft.fields, draft.totalPages, draft.signers);
      // Capture the current signer roster as `last_signers` so the
      // next user of this template starts with the same recipients
      // pre-filled. The wizard's Step-2 SignersStepCard reads from
      // `template.lastSigners` when seeding its state.
      const lastSigners = draft.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
      }));
      updateTemplate(sourceTemplate.id, {
        field_layout: fieldLayout,
        last_signers: lastSigners,
      })
        .then((updated) => {
          setTemplates(getTemplates().map((t) => (t.id === updated.id ? updated : t)));
        })
        .catch(() => {
          setToast({
            title: 'Template update failed',
            subtitle: 'Sending the document anyway.',
            tone: 'error',
          });
        });
    }
    runSend().catch(() => {});
  }, [sourceTemplate, draft, runSend]);

  // ---- Navigation guards (Back / cancel) -------------------------------

  const goBackToWizard = useCallback(() => {
    // Step 3 → Step 2 (signers) of the wizard.
    if (isNewTemplate) {
      navigate('/templates/new/use');
      return;
    }
    navigate(`/templates/${encodeURIComponent(decodedId)}/use`);
  }, [isNewTemplate, decodedId, navigate]);

  const goCancel = useCallback(() => navigate('/templates'), [navigate]);

  // unsaved-work guards (only meaningful once the draft has either fields or
  // signers attached; clean drafts can leave silently)
  const hasUnsavedWork = Boolean(draft && (draft.fields.length > 0 || draft.signers.length > 0));

  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasUnsavedWork]);

  const handleExitConfirm = useCallback(() => {
    setExitOpen(false);
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [navigate, pendingNav]);

  const handleExitCancel = useCallback(() => {
    setExitOpen(false);
    setPendingNav(null);
  }, []);

  // ---- Banner + render ------------------------------------------------

  const banner = useMemo(() => {
    if (!bannerOpen) return null;
    if (mode === 'new') {
      return (
        <TemplateModeBanner
          tone="success"
          title="Last step — place fields, then save as template"
          subtitle={`Drop fields where they should appear. When you're done, hit "Save as template" in the right panel to make this reusable.`}
          onDismiss={() => setBannerOpen(false)}
        />
      );
    }
    if (!sourceTemplate) {
      return (
        <TemplateModeBanner
          tone="info"
          title="Working from a saved template"
          subtitle="Field layout was loaded from a template. Adjust as needed before sending."
          onDismiss={() => setBannerOpen(false)}
        />
      );
    }
    const fields = sourceTemplate.fields.length;
    // Banner reflects the resolved page count of the active draft —
    // not the template's stored count, which may be 0 for templates
    // created before we captured `pages` on Save-as-template.
    const totalPages = Math.max(1, draft?.totalPages ?? sourceTemplate.pages ?? 1);
    if (draft?.fromTemplateFreshUpload) {
      return (
        <TemplateModeBanner
          tone="info"
          title={`Saved layout adapted to your new document · ${String(fields)} fields across ${String(totalPages)} pages`}
          subtitle="Field rules adjusted for the new page count. Drag any field to nudge it, then send."
          onDismiss={() => setBannerOpen(false)}
        />
      );
    }
    return (
      <TemplateModeBanner
        tone="info"
        title={`Saved layout loaded · ${String(fields)} fields across ${String(totalPages)} pages`}
        subtitle="Edit anything you'd like, then send. Save changes back to the template if you want them to stick."
        onDismiss={() => setBannerOpen(false)}
      />
    );
  }, [bannerOpen, mode, sourceTemplate, draft]);

  // While the PDF is parsing or the draft hasn't been bootstrapped,
  // render only the chrome + a quiet placeholder. The DocumentPage
  // requires a totalPages > 0 so we'd crash if we mounted it early.
  const ready = Boolean(draft);

  const sendInFlight = sendEnvelope.phase !== 'idle' && sendEnvelope.phase !== 'error';

  return (
    <Page>
      <TemplateFlowHeader
        step={3}
        mode={mode}
        templateName={headerTitle}
        onRenameTemplate={renameTemplate}
        onBack={goBackToWizard}
        onCancel={goCancel}
      />

      <PageBody>
        {ready && draft ? (
          <DocumentPage
            totalPages={draft.totalPages}
            title={draft.title}
            docId={draft.code}
            {...(pdfDoc ? { pdfDoc } : {})}
            pdfLoading={pdfLoading}
            fields={draft.fields}
            onFieldsChange={handleFieldsChange}
            signers={draft.signers}
            contacts={contacts}
            onAddSignerFromContact={handleAddSignerFromContact}
            onCreateSigner={handleCreateSigner}
            onRemoveSigner={handleRemoveSigner}
            availableFieldKinds={TEMPLATE_FIELD_KINDS}
            {...(banner ? { banner } : {})}
            onSend={mode === 'new' ? () => {} : handleSend}
            onSaveAsTemplate={() => {
              handleSaveAsTemplate().catch(() => {});
            }}
            sendLabel={mode === 'new' ? 'Save as template' : 'Send to sign'}
            templateMode={mode === 'new' ? 'authoring' : 'using'}
            templateName={headerTitle}
            onBack={goBackToWizard}
          />
        ) : null}

        {!ready ? (
          <div role="status" style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>
            {/* Quiet placeholder while pdf.js parses + we bootstrap the
              draft. The DocumentPage will replace this once `ready`. */}
            {user ? 'Preparing your template…' : ''}
          </div>
        ) : null}
      </PageBody>

      <SendConfirmDialog
        open={sendConfirmOpen}
        onSendAndUpdate={handleSendAndUpdate}
        onJustSend={handleSendJust}
        onCancel={() => setSendConfirmOpen(false)}
      />
      {toast ? (
        <Toast
          title={toast.title}
          {...(toast.subtitle ? { subtitle: toast.subtitle } : {})}
          tone={toast.tone}
        />
      ) : null}
      <ExitConfirmDialog
        open={exitOpen}
        onConfirm={handleExitConfirm}
        onCancel={handleExitCancel}
      />
      <SendingOverlay
        open={sendInFlight || Boolean(sendError)}
        phase={sendEnvelope.phase}
        error={sendError}
        signers={(draft?.signers ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          color: s.color,
        }))}
        fieldCount={draft?.fields.length ?? 0}
        onRetry={() => {
          sendEnvelope.reset();
          setSendError(null);
        }}
      />
    </Page>
  );
}
