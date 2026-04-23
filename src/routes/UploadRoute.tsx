import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadPage } from '../pages/UploadPage';
import { CreateSignatureRequestDialog } from '../components/CreateSignatureRequestDialog';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { useAppState } from '../providers/AppStateProvider';
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSigners, setSelectedSigners] = useState<ReadonlyArray<AddSignerContact>>([]);
  const { numPages } = usePdfDocument(pdfFile);

  const handleFileSelected = useCallback((file: File) => {
    setPdfFile(file);
    setSelectedSigners([]);
    setDialogOpen(true);
  }, []);

  const handleAddFromContact = useCallback((contact: AddSignerContact) => {
    setSelectedSigners((prev) =>
      prev.some((s) => s.id === contact.id) ? prev : [...prev, contact],
    );
  }, []);

  const handleCreateContact = useCallback(
    (name: string, email: string) => {
      const created = addContact(name, email);
      setSelectedSigners((prev) => [...prev, created]);
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

  return (
    <>
      <UploadPage
        user={user ?? undefined}
        onFileSelected={handleFileSelected}
        activeNavId="sign"
        onSelectNavItem={handleSelectNavItem}
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
