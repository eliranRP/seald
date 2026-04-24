import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadPage } from '../pages/UploadPage';
import { CreateSignatureRequestDialog } from '../components/CreateSignatureRequestDialog';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { usePdfDocument } from '../lib/pdf';
import { NAV_ITEMS } from '../layout/navItems';

/**
 * Route wrapper around `UploadPage` that gates document creation on the
 * "add signers" dialog — the user must pick at least one signer before the
 * new document is created and routed to the editor.
 */
export function UploadRoute() {
  const navigate = useNavigate();
  const { user, contacts, createDocument, addContact, updateDocument } = useAppState();
  const { guest, exitGuestMode, signOut } = useAuth();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSigners, setSelectedSigners] = useState<ReadonlyArray<AddSignerContact>>([]);
  const { numPages } = usePdfDocument(pdfFile);

  // Open the signer-picker once the PDF has been parsed (numPages > 0).
  // In the meantime UploadPage shows the "Analyzing" loader. If parsing
  // fails numPages stays 0 forever — a small defensive timeout opens
  // the dialog anyway so the user is never stuck.
  useEffect(() => {
    if (!pdfFile) return undefined;
    if (numPages > 0) {
      setDialogOpen(true);
      return undefined;
    }
    const t = window.setTimeout(() => setDialogOpen(true), 3000);
    return () => window.clearTimeout(t);
  }, [pdfFile, numPages]);

  const handleFileSelected = useCallback((file: File) => {
    setPdfFile(file);
    setSelectedSigners([]);
    // Hold the signer-picker dialog until the PDF has been parsed so
    // the UploadPage can show its "Analyzing your document" loader in
    // the intervening window.
    setDialogOpen(false);
  }, []);

  const handleAddFromContact = useCallback((contact: AddSignerContact) => {
    setSelectedSigners((prev) =>
      prev.some((s) => s.id === contact.id) ? prev : [...prev, contact],
    );
  }, []);

  const handleCreateContact = useCallback(
    (name: string, email: string) => {
      addContact(name, email)
        .then((created) => {
          setSelectedSigners((prev) => [...prev, created]);
        })
        .catch(() => {
          // Creation errors surface in the console for now; keeping the
          // dialog open lets the user retry without losing their other picks.
        });
    },
    [addContact],
  );

  const handleRemoveSelected = useCallback((id: string) => {
    setSelectedSigners((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pdfFile || selectedSigners.length === 0) return;
    const id = createDocument(pdfFile, Math.max(1, numPages));
    updateDocument(id, {
      signers: selectedSigners.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
      })),
    });
    setDialogOpen(false);
    setPdfFile(null);
    setSelectedSigners([]);
    navigate(`/document/${id}`);
  }, [pdfFile, selectedSigners, createDocument, updateDocument, numPages, navigate]);

  const handleCancelDialog = useCallback(() => {
    setDialogOpen(false);
    setPdfFile(null);
    setSelectedSigners([]);
  }, []);

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

  const navMode = !user && guest ? 'guest' : 'authed';

  return (
    <>
      <UploadPage
        user={user ?? undefined}
        onFileSelected={handleFileSelected}
        activeNavId="sign"
        onSelectNavItem={handleSelectNavItem}
        navMode={navMode}
        onSignIn={() => handleAuthCta('/signin')}
        onSignUp={() => handleAuthCta('/signup')}
        onSignOut={handleSignOut}
        status={pdfFile && !dialogOpen ? 'analyzing' : 'idle'}
        {...(pdfFile ? { analyzingFileName: pdfFile.name } : {})}
      />
      <CreateSignatureRequestDialog
        open={dialogOpen}
        signers={selectedSigners}
        contacts={contacts}
        onAddFromContact={handleAddFromContact}
        onCreateContact={handleCreateContact}
        onRemoveSigner={handleRemoveSelected}
        onApply={handleConfirm}
        onCancel={handleCancelDialog}
      />
    </>
  );
}
