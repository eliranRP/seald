import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentPage } from '../pages/DocumentPage';
import { EnvelopeDetailPage } from '../pages/EnvelopeDetailPage';
import { ExitConfirmDialog } from '../components/ExitConfirmDialog';
import { GuestSenderEmailDialog } from '../components/GuestSenderEmailDialog';
import { SaveAsTemplateDialog } from '../components/SaveAsTemplateDialog';
import type { SaveAsTemplatePayload } from '../components/SaveAsTemplateDialog';
import { SendConfirmDialog } from '../components/SendConfirmDialog';
import { SendingOverlay } from '../components/SendingOverlay';
import { TemplateModeBanner } from '../components/TemplateModeBanner';
import { Toast } from '../components/Toast';
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
  setTemplates,
} from '../features/templates';
import { createTemplate, updateTemplate } from '../features/templates/templatesApi';

// The editor canvas is fixed-width; field coords are stored in px during the
// draft and normalized to 0–1 just before the send hits the backend.
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 740;

// Local pixel widths/heights that mirror the defaults in the recipient
// surface's SignerField component. Kept here because the sender stores
// per-field `width` / `height` in px when the user hasn't resized.
const DEFAULT_PX: Record<FieldKind, { readonly w: number; readonly h: number }> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
};

function toNormalized(
  field: PlacedFieldValue,
): Pick<FieldPlacement, 'x' | 'y' | 'width' | 'height'> {
  const widthPx = field.width ?? DEFAULT_PX[field.type as FieldKind]?.w ?? DEFAULT_PX.text.w;
  const heightPx = field.height ?? DEFAULT_PX[field.type as FieldKind]?.h ?? DEFAULT_PX.text.h;
  return {
    x: Math.max(0, Math.min(1, field.x / CANVAS_WIDTH)),
    y: Math.max(0, Math.min(1, field.y / CANVAS_HEIGHT)),
    width: Math.max(0, Math.min(1, widthPx / CANVAS_WIDTH)),
    height: Math.max(0, Math.min(1, heightPx / CANVAS_HEIGHT)),
  };
}

interface ToastState {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly tone: 'success' | 'error' | 'info';
}

/**
 * Route wrapper around `DocumentPage`. Manages the in-memory draft (File +
 * fields + signers) while the user composes, then publishes the draft to
 * the `/envelopes/*` API on send (create → upload → addSigner per contact
 * → placeFields → send).
 *
 * When the draft was started from a saved template (`fromTemplateId` set
 * by `UploadRoute`), the editor renders a contextual `TemplateModeBanner`
 * above the canvas and prompts with `SendConfirmDialog` ("update template
 * too?") on send so the user can fold any field-layout changes back into
 * the canonical record.
 */
export function DocumentRoute() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { contacts, getDocument, updateDocument, addContact, sendDocument } = useAppState();
  const { guest } = useAuth();
  const doc = params.id ? getDocument(params.id) : undefined;
  const { doc: pdfDoc, loading: pdfLoading } = usePdfDocument(doc?.file ?? null);
  const [exitOpen, setExitOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [guestSenderOpen, setGuestSenderOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const sendEnvelope = useSendEnvelope();

  // Resolve the source template (if any) so the banner copy can quote
  // the exact name/page count. Re-resolves when the module store
  // updates (e.g. after the user saves edits back to the template).
  const sourceTemplate = useMemo(
    () => (doc?.fromTemplateId ? findTemplateById(doc.fromTemplateId) : undefined),
    [doc?.fromTemplateId],
  );

  const handleFieldsChange = useCallback(
    (next: ReadonlyArray<PlacedFieldValue>) => {
      if (!doc) return;
      updateDocument(doc.id, { fields: next });
    },
    [doc, updateDocument],
  );

  const handleAddSignerFromContact = useCallback(
    (contact: AddSignerContact) => {
      if (!doc) return;
      if (doc.signers.some((s) => s.id === contact.id)) return;
      updateDocument(doc.id, {
        signers: [
          ...doc.signers,
          { id: contact.id, name: contact.name, email: contact.email, color: contact.color },
        ],
      });
    },
    [doc, updateDocument],
  );

  const handleCreateSigner = useCallback(
    (name: string, email: string) => {
      if (!doc) return;
      addContact(name, email)
        .then((created) => {
          updateDocument(doc.id, {
            signers: [
              ...doc.signers,
              { id: created.id, name: created.name, email: created.email, color: created.color },
            ],
          });
        })
        .catch(() => {
          /* swallowed — the contact simply doesn't get attached */
        });
    },
    [doc, addContact, updateDocument],
  );

  const handleRemoveSigner = useCallback(
    (id: string) => {
      if (!doc) return;
      updateDocument(doc.id, {
        signers: doc.signers.filter((s) => s.id !== id),
        fields: doc.fields.map((f) =>
          f.signerIds.includes(id)
            ? { ...f, signerIds: f.signerIds.filter((sid) => sid !== id) }
            : f,
        ),
      });
    },
    [doc, updateDocument],
  );

  // "Unsaved work" covers anything the user composed and hasn't sent —
  // placed fields OR attached signers. The previous check was fields-only,
  // which let users lose an entire signer roster by clicking Back without
  // any prompt. While the doc is a draft and the editor is open, we treat
  // the session itself as unsaved.
  const hasUnsavedWork = Boolean(
    doc && doc.status === 'draft' && (doc.fields.length > 0 || doc.signers.length > 0),
  );

  // Captures the post-confirm destination. '/documents' for the in-app
  // Back button, 'back' for a popstate-driven (browser back) intercept.
  const [pendingNav, setPendingNav] = useState<string | null>(null);

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

  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    window.history.pushState({ docGuard: true }, '');
    const handler = (): void => {
      setPendingNav('back');
      setExitOpen(true);
      window.history.pushState({ docGuard: true }, '');
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }, [hasUnsavedWork]);

  const handleBackClick = useCallback(() => {
    if (hasUnsavedWork) {
      setPendingNav('/documents');
      setExitOpen(true);
      return;
    }
    navigate('/documents');
  }, [hasUnsavedWork, navigate]);

  const handleExitConfirm = useCallback(() => {
    setExitOpen(false);
    if (pendingNav === 'back') {
      setPendingNav(null);
      navigate('/documents');
      return;
    }
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [navigate, pendingNav]);

  const handleExitCancel = useCallback(() => {
    setExitOpen(false);
    setPendingNav(null);
  }, []);

  /**
   * Internal — actually push the envelope to the API. Split out from
   * `handleSend` so the SendConfirmDialog branches can call it after
   * doing or skipping the template-update step.
   *
   * Guest mode now goes through the same `/envelopes/*` API path as
   * authed users (anonymous Supabase JWT). The caller passes the
   * sender identity captured by `GuestSenderEmailDialog`; for authed
   * users both args are `undefined` and the server uses the JWT email.
   */
  const runSend = useCallback(
    async (senderEmail?: string, senderName?: string) => {
      if (!doc || !doc.file) return;
      setSendError(null);

      try {
        const result = await sendEnvelope.run({
          title: doc.title,
          file: doc.file,
          signers: doc.signers.map((s) => ({ contactId: s.id })),
          buildFields: (contactIdToSignerId) => {
            const out: FieldPlacement[] = [];
            for (const f of doc.fields) {
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
          ...(senderEmail !== undefined ? { senderEmail } : {}),
          ...(senderName !== undefined ? { senderName } : {}),
        });

        // Persist the server envelope id back onto the local draft so the
        // post-send redirect (which puts the server uuid in the URL) can
        // still resolve the draft via `getDocument`. Without this the
        // SentConfirmationPage would render its "Document not found"
        // fallback for guest senders, and "View envelope" from /sent would
        // land on an empty editor instead of the original draft.
        sendDocument(doc.id, result.envelope_id);
        navigate(`/document/${result.envelope_id}/sent`);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Unable to send the document.');
      }
    },
    [doc, navigate, sendDocument, sendEnvelope],
  );

  /**
   * Patch the source template with the current placed-field layout —
   * fired by the SendConfirmDialog "Send and update" path. The editor's
   * `PlacedFieldValue[]` is collapsed back into `TemplateField[]`
   * (with `pageRule` rules) so the saved layout retains the same
   * page-adaptation semantics.
   */
  const updateSourceTemplate = useCallback(async () => {
    if (!doc?.fromTemplateId) return;
    const fieldLayout = deriveTemplateFieldLayout(doc.fields, doc.totalPages, doc.signers);
    const updated = await updateTemplate(doc.fromTemplateId, { field_layout: fieldLayout });
    setTemplates(getTemplates().map((t) => (t.id === updated.id ? updated : t)));
  }, [doc?.fields, doc?.fromTemplateId, doc?.totalPages, doc?.signers]);

  const handleSend = useCallback(() => {
    // Guest mode: capture sender identity first (the anonymous Supabase
    // JWT has no email, so the API needs it in the body). The
    // template-confirm and actual send fire from inside the dialog's
    // onConfirm handler.
    if (guest) {
      setGuestSenderOpen(true);
      return;
    }
    // When the draft was started from a saved template, prompt the
    // user with the "update template too?" dialog before sending.
    // Plain drafts (no template provenance) skip straight to send.
    if (doc?.fromTemplateId) {
      setSendConfirmOpen(true);
      return;
    }
    runSend().catch(() => {
      /* surfaced via setSendError inside runSend */
    });
  }, [doc?.fromTemplateId, guest, runSend]);

  const handleGuestSenderConfirm = useCallback(
    (email: string, name?: string) => {
      setGuestSenderOpen(false);
      // Same template-prompt branching as the authed path, just
      // threaded with the captured guest sender identity.
      if (doc?.fromTemplateId) {
        // Stash sender for the SendConfirmDialog branches via runSend
        // bound below — for guest+template, skip the prompt and just
        // send. (The "update template" choice is meaningless to a
        // guest who has no persisted templates.)
        runSend(email, name).catch(() => {
          /* surfaced via setSendError */
        });
        return;
      }
      runSend(email, name).catch(() => {
        /* surfaced via setSendError */
      });
    },
    [doc?.fromTemplateId, runSend],
  );

  const handleSendJust = useCallback(() => {
    setSendConfirmOpen(false);
    runSend().catch(() => {
      /* surfaced via setSendError */
    });
  }, [runSend]);

  const handleSendAndUpdate = useCallback(() => {
    setSendConfirmOpen(false);
    // Fire-and-forget the template update — failure should NOT block
    // the send (the user's primary goal is sending). We surface a
    // toast on success either way.
    updateSourceTemplate().catch(() => {
      setToast({
        title: 'Template update failed',
        subtitle: 'Sending the document anyway.',
        tone: 'error',
      });
    });
    runSend().catch(() => {
      /* surfaced via setSendError */
    });
  }, [runSend, updateSourceTemplate]);

  const handleSaveDraft = useCallback(() => {
    if (!doc) return;
    updateDocument(doc.id, { status: 'draft' });
    navigate('/documents');
  }, [doc, updateDocument, navigate]);

  const handleOpenSaveTemplate = useCallback(() => {
    setSaveTplOpen(true);
  }, []);

  const handleSaveTemplate = useCallback(
    async (payload: SaveAsTemplatePayload) => {
      if (!doc) return;
      try {
        const fieldLayout = deriveTemplateFieldLayout(doc.fields, doc.totalPages, doc.signers);
        const created = await createTemplate({
          title: payload.title,
          field_layout: fieldLayout,
          ...(payload.description ? { description: payload.description } : {}),
          cover_color: '#EEF2FF',
        });
        setTemplates([created, ...getTemplates()]);
        setSaveTplOpen(false);
        setToast({
          title: 'Template saved',
          subtitle: 'Reuse it any time from the templates list.',
          tone: 'success',
        });
      } catch (err) {
        setToast({
          title: 'Save failed',
          subtitle:
            err instanceof Error ? err.message : 'Failed to save template. Please try again.',
          tone: 'error',
        });
      }
    },
    [doc],
  );

  const handleCancelSaveTemplate = useCallback(() => {
    setSaveTplOpen(false);
  }, []);

  // Auto-dismiss toasts after a few seconds — non-blocking confirmation,
  // no user action required. Errors get the same auto-dismiss; the
  // user can re-trigger the action and see another error toast if it
  // recurs.
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Build the contextual banner for templates flow. Three copies:
  //   - new mode (sender came from /templates/new)
  //   - use+saved (saved doc + saved layout)
  //   - use+upload (fresh PDF + adapted layout)
  // Plain drafts get no banner.
  const banner = useMemo(() => {
    if (!doc?.fromTemplateId) return null;
    if (!sourceTemplate) {
      // Source template not in the local store — show a soft note
      // so the user still knows the draft has provenance.
      return (
        <TemplateModeBanner
          tone="info"
          title="Working from a saved template"
          subtitle="Field layout was loaded from a template. Adjust as needed before sending."
        />
      );
    }
    const fieldRulesCount = sourceTemplate.fields.length;
    const totalPages = doc.totalPages;
    if (doc.fromTemplateFreshUpload) {
      return (
        <TemplateModeBanner
          tone="info"
          title={`Saved layout adapted to your new document · ${String(fieldRulesCount)} fields across ${String(totalPages)} pages`}
          subtitle="Field rules adjusted for the new page count. Drag any field to nudge it, then send."
        />
      );
    }
    return (
      <TemplateModeBanner
        tone="info"
        title={`Saved layout loaded · ${String(fieldRulesCount)} fields across ${String(totalPages)} pages`}
        subtitle="Edit anything you'd like, then send. Save changes back to the template if you want them to stick."
      />
    );
  }, [doc?.fromTemplateId, doc?.fromTemplateFreshUpload, doc?.totalPages, sourceTemplate]);

  // The editor only makes sense for in-progress drafts. The local
  // AppStateProvider record persists with `status: 'awaiting-others'` and
  // an `envelopeId` after `useSendEnvelope` publishes it, so
  // `getDocument(envelopeId)` keeps resolving the in-memory draft (needed
  // for the post-send `/sent` screen). For every navigation back to
  // `/document/:envelopeId` after that — clicking the row in /documents,
  // hitting "View envelope" again, deep-linking — we want the read-only
  // envelope/audit view, NOT the editor's "Ready to send" rail.
  if (!doc || doc.status !== 'draft') {
    return <EnvelopeDetailPage />;
  }

  const sendInFlight = sendEnvelope.phase !== 'idle' && sendEnvelope.phase !== 'error';

  return (
    <>
      <DocumentPage
        totalPages={doc.totalPages}
        title={doc.title}
        docId={doc.code}
        {...(pdfDoc ? { pdfDoc } : {})}
        pdfLoading={pdfLoading}
        fields={doc.fields}
        onFieldsChange={handleFieldsChange}
        signers={doc.signers}
        contacts={contacts}
        onAddSignerFromContact={handleAddSignerFromContact}
        onCreateSigner={handleCreateSigner}
        onRemoveSigner={handleRemoveSigner}
        onSend={handleSend}
        onSaveDraft={handleSaveDraft}
        onBack={handleBackClick}
        onSaveAsTemplate={handleOpenSaveTemplate}
        {...(banner ? { banner } : {})}
      />
      <SaveAsTemplateDialog
        open={saveTplOpen}
        defaultTitle={doc.title}
        onSave={(p) => {
          handleSaveTemplate(p).catch(() => {
            /* surfaced via setToast */
          });
        }}
        onCancel={handleCancelSaveTemplate}
      />
      <SendConfirmDialog
        open={sendConfirmOpen}
        onSendAndUpdate={handleSendAndUpdate}
        onJustSend={handleSendJust}
        onCancel={() => setSendConfirmOpen(false)}
      />
      <GuestSenderEmailDialog
        open={guestSenderOpen}
        onConfirm={handleGuestSenderConfirm}
        onCancel={() => setGuestSenderOpen(false)}
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
        signers={doc.signers.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          color: s.color,
        }))}
        fieldCount={doc.fields.length}
        onRetry={() => {
          sendEnvelope.reset();
          setSendError(null);
        }}
      />
    </>
  );
}
