import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentPage } from '../pages/DocumentPage';
import { ExitConfirmDialog } from '../components/ExitConfirmDialog';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';
import { usePdfDocument } from '../lib/pdf';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { NAV_ITEMS } from '../layout/navItems';

/**
 * Route wrapper around `DocumentPage`. Binds the document's persisted fields /
 * signers to the in-memory app state, gates the back navigation on an
 * exit-without-sending confirm dialog, and routes to the sent-confirmation
 * page when the user hits Send.
 */
export function DocumentRoute() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { user, contacts, getDocument, updateDocument, addContact, sendDocument } = useAppState();
  const { guest, exitGuestMode, signOut } = useAuth();
  const doc = params.id ? getDocument(params.id) : undefined;
  const { doc: pdfDoc, loading: pdfLoading } = usePdfDocument(doc?.file ?? null);
  const [exitOpen, setExitOpen] = useState(false);

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
          // Left unhandled here; the contact simply doesn't get attached.
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

  const handleSend = useCallback(() => {
    if (!doc) return;
    sendDocument(doc.id);
    navigate(`/document/${doc.id}/sent`);
  }, [doc, sendDocument, navigate]);

  const handleSaveDraft = useCallback(() => {
    if (!doc) return;
    updateDocument(doc.id, { status: 'draft' });
    navigate('/documents');
  }, [doc, updateDocument, navigate]);

  const handleSelectNavItem = useCallback(
    (id: string): void => {
      const item = NAV_ITEMS.find((n) => n.id === id);
      if (item) {
        navigate(item.path);
      }
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
        /* soft-fail: still route to signin */
      })
      .finally(() => navigate('/signin', { replace: true }));
  }, [signOut, navigate]);

  if (!doc) {
    return null;
  }

  const navMode = !user && guest ? 'guest' : 'authed';

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
    </>
  );
}
