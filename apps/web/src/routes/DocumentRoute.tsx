import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentPage } from '../pages/DocumentPage';
import { EnvelopeDetailPage } from '../pages/EnvelopeDetailPage';
import { ExitConfirmDialog } from '../components/ExitConfirmDialog';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';
import { usePdfDocument } from '../lib/pdf';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { NAV_ITEMS } from '../layout/navItems';
import { useSendEnvelope } from '../features/envelopes';
import type { FieldKind, FieldPlacement } from '../features/envelopes';

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

/**
 * Floating status toast shown while the send orchestration is in flight
 * (or after it errors). Intentionally plain styling to avoid adding a new
 * core component for one route.
 */
function SendFlash({ phase, error }: { readonly phase: string; readonly error: string | null }) {
  const labels: Record<string, string> = {
    creating: 'Creating envelope…',
    uploading: 'Uploading document…',
    'adding-signers': 'Adding signers…',
    'placing-fields': 'Placing fields…',
    sending: 'Sending for signature…',
    done: 'Sent!',
  };
  const message = error ?? labels[phase] ?? '';
  if (!message) return null;
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 100,
        padding: '12px 16px',
        borderRadius: 10,
        background: error ? '#FEF2F2' : '#0B1220',
        color: error ? '#B91C1C' : '#FFFFFF',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 10px 30px rgba(11,18,32,0.2)',
        border: error ? '1px solid #EF4444' : '1px solid transparent',
      }}
    >
      {message}
    </div>
  );
}

/**
 * Route wrapper around `DocumentPage`. Manages the in-memory draft (File +
 * fields + signers) while the user composes, then publishes the draft to
 * the `/envelopes/*` API on send (create → upload → addSigner per contact
 * → placeFields → send).
 */
export function DocumentRoute() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { user, contacts, getDocument, updateDocument, addContact, sendDocument } = useAppState();
  const { guest, exitGuestMode, signOut } = useAuth();
  const doc = params.id ? getDocument(params.id) : undefined;
  const { doc: pdfDoc, loading: pdfLoading } = usePdfDocument(doc?.file ?? null);
  const [exitOpen, setExitOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendEnvelope = useSendEnvelope();

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

  const hasUnsavedWork = Boolean(doc && doc.fields.length > 0 && doc.status === 'draft');

  const handleBackClick = useCallback(() => {
    if (hasUnsavedWork) {
      setExitOpen(true);
      return;
    }
    navigate('/documents');
  }, [hasUnsavedWork, navigate]);

  const handleSend = useCallback(async () => {
    if (!doc || !doc.file) return;
    setSendError(null);

    // Guest mode has no Supabase session → no authed `/envelopes` writes.
    // Fall back to the pre-existing local-only send behaviour so the
    // demo flow still completes. Authed users take the API path.
    if (guest) {
      sendDocument(doc.id);
      navigate(`/document/${doc.id}/sent`);
      return;
    }

    try {
      const result = await sendEnvelope.run({
        title: doc.title,
        file: doc.file,
        signers: doc.signers.map((s) => ({ contactId: s.id })),
        buildFields: (contactIdToSignerId) => {
          const out: FieldPlacement[] = [];
          // Fan out across every signer the user assigned the field to.
          // The backend contract places one field per (signer, placement)
          // tuple — multi-signer fields become multiple API rows, linked
          // by the shared `linkId`.
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
      });

      sendDocument(doc.id);
      // Carry the server envelope id forward so the sent-confirmation page
      // can deep-link back to the dashboard row.
      navigate(`/document/${result.envelope_id}/sent`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to send the document.');
    }
  }, [doc, guest, navigate, sendDocument, sendEnvelope]);

  const handleSaveDraft = useCallback(() => {
    if (!doc) return;
    updateDocument(doc.id, { status: 'draft' });
    navigate('/documents');
  }, [doc, updateDocument, navigate]);

  const handleSelectNavItem = useCallback(
    (id: string): void => {
      const item = NAV_ITEMS.find((n) => n.id === id);
      if (item) navigate(item.path);
    },
    [navigate],
  );

  const handleAuthCta = useCallback(
    (path: string): void => {
      exitGuestMode();
      navigate(path);
    },
    [exitGuestMode, navigate],
  );

  const handleSignOut = useCallback((): void => {
    signOut()
      .catch(() => {
        /* soft-fail */
      })
      .finally(() => navigate('/signin', { replace: true }));
  }, [signOut, navigate]);

  if (!doc) {
    // No local draft under this id — the user deep-linked (or came from the
    // dashboard) to a server-side envelope. Render the read-only detail view
    // instead of the authoring editor; the editor requires the raw File.
    return <EnvelopeDetailPage />;
  }

  const navMode = !user && guest ? 'guest' : 'authed';
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
        onSend={() => {
          handleSend().catch(() => {
            /* surfaced via setSendError */
          });
        }}
        onSaveDraft={handleSaveDraft}
        onBack={handleBackClick}
        user={user ?? undefined}
        activeNavId="sign"
        onSelectNavItem={handleSelectNavItem}
        navMode={navMode}
        onSignIn={() => handleAuthCta('/signin')}
        onSignUp={() => handleAuthCta('/signup')}
        onSignOut={handleSignOut}
      />
      <ExitConfirmDialog
        open={exitOpen}
        onConfirm={() => {
          setExitOpen(false);
          navigate('/documents');
        }}
        onCancel={() => setExitOpen(false)}
      />
      {sendInFlight || sendError ? (
        <SendFlash phase={sendEnvelope.phase} error={sendError} />
      ) : null}
    </>
  );
}
