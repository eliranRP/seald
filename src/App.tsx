import { useCallback, useState } from 'react';
import type { AddSignerContact, PlacedFieldValue } from './index';
import { CreateSignatureRequestDialog, DocumentPage, UploadPage } from './index';

type View = 'upload' | 'add-signers' | 'document';

interface AppSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

const INITIAL_SIGNERS: ReadonlyArray<AppSigner> = [];

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
  { id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
  { id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' },
  { id: 'c5', name: 'Priya Kapoor', email: 'priya@kapoor.com', color: '#818CF8' },
];

const SIGNER_COLOR_PALETTE = ['#F472B6', '#7DD3FC', '#10B981', '#F59E0B', '#818CF8'] as const;

const USER = { name: 'Jamie Okonkwo' };

export function App() {
  const [view, setView] = useState<View>('upload');
  const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>([]);
  const [signers, setSigners] = useState<ReadonlyArray<AppSigner>>(INITIAL_SIGNERS);

  const handleFileSelected = useCallback((_file: File) => {
    setFields([]);
    // Before placing any fields, require the user to name at least one signer.
    // This mirrors the "Create your signature request" step common to e-sign
    // apps and keeps signer setup out of the document canvas chrome.
    setView('add-signers');
  }, []);

  const handleConfirmSigners = useCallback(() => {
    setView('document');
  }, []);

  const handleCancelSigners = useCallback(() => {
    // Dismissing the add-signers step drops any signers the user picked in
    // this flow so reopening the step starts empty.
    setSigners(INITIAL_SIGNERS);
    setView('upload');
  }, []);

  const handleAddSignerFromContact = useCallback((contact: AddSignerContact) => {
    setSigners((prev) =>
      prev.some((s) => s.id === contact.id)
        ? prev
        : [
            ...prev,
            { id: contact.id, name: contact.name, email: contact.email, color: contact.color },
          ],
    );
  }, []);

  const handleCreateSigner = useCallback((name: string, email: string) => {
    setSigners((prev) => {
      const color = SIGNER_COLOR_PALETTE[prev.length % SIGNER_COLOR_PALETTE.length] ?? '#818CF8';
      const id = `s_${Date.now().toString(36)}`;
      return [...prev, { id, name, email, color }];
    });
  }, []);

  const handleRemoveSigner = useCallback((id: string) => {
    setSigners((prev) => prev.filter((s) => s.id !== id));
    // Drop the signer from every field that referenced them so the document
    // stays internally consistent.
    setFields((prev) =>
      prev.map((f) =>
        f.signerIds.includes(id) ? { ...f, signerIds: f.signerIds.filter((sid) => sid !== id) } : f,
      ),
    );
  }, []);

  const handleBack = useCallback(() => {
    setView('upload');
  }, []);

  if (view === 'upload') {
    return <UploadPage user={USER} onFileSelected={handleFileSelected} />;
  }

  if (view === 'add-signers') {
    return (
      <>
        <UploadPage user={USER} onFileSelected={handleFileSelected} />
        <CreateSignatureRequestDialog
          open
          signers={signers}
          contacts={CONTACTS}
          onAddFromContact={handleAddSignerFromContact}
          onCreateContact={handleCreateSigner}
          onRemoveSigner={handleRemoveSigner}
          onApply={handleConfirmSigners}
          onCancel={handleCancelSigners}
        />
      </>
    );
  }

  return (
    <DocumentPage
      totalPages={4}
      initialPage={1}
      user={USER}
      signers={signers}
      contacts={CONTACTS}
      fields={fields}
      onFieldsChange={setFields}
      onAddSignerFromContact={handleAddSignerFromContact}
      onCreateSigner={handleCreateSigner}
      onRemoveSigner={handleRemoveSigner}
      onSend={() => {}}
      onSaveDraft={() => {}}
      onBack={handleBack}
    />
  );
}
