import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';

/**
 * Canonical color palette used when auto-assigning a color to a freshly created
 * signer. Kept here (rather than in App.tsx) so every page can follow the same
 * assignment policy when a signer is added from within a document flow or from
 * the contacts page.
 */
const SIGNER_COLOR_PALETTE = ['#F472B6', '#7DD3FC', '#10B981', '#F59E0B', '#818CF8'] as const;

export type DocumentStatus =
  | 'draft'
  | 'awaiting-you'
  | 'awaiting-others'
  | 'completed'
  | 'declined';

export interface DocumentSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface AppDocument {
  readonly id: string;
  readonly title: string;
  /** Short display identifier shown alongside the title (e.g. `DOC-8F3A`). */
  readonly code: string;
  readonly status: DocumentStatus;
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly signers: ReadonlyArray<DocumentSigner>;
  /** ISO string — the date the document was last updated / sent. */
  readonly updatedAt: string;
  /** Raw uploaded File — null for seeded demo documents that were never uploaded. */
  readonly file: File | null;
  /** Estimated / mocked page count. Comes from the parsed PDF when `file` is set. */
  readonly totalPages: number;
}

export interface AppUser {
  readonly name: string;
}

export interface AppStateValue {
  readonly user: AppUser;
  readonly documents: ReadonlyArray<AppDocument>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly getDocument: (id: string) => AppDocument | undefined;
  readonly createDocument: (file: File, totalPages: number) => string;
  readonly updateDocument: (id: string, patch: Partial<AppDocument>) => void;
  readonly sendDocument: (id: string) => void;
  readonly deleteDocument: (id: string) => void;
  readonly addContact: (name: string, email: string) => AddSignerContact;
  readonly updateContact: (id: string, patch: { name?: string; email?: string }) => void;
  readonly removeContact: (id: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const USER: AppUser = { name: 'Jamie Okonkwo' };

const SEED_CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
  { id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
  { id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' },
  { id: 'c5', name: 'Priya Kapoor', email: 'priya@kapoor.com', color: '#818CF8' },
];

/**
 * Seed the dashboard with representative documents so the list isn't empty on
 * first load. These have no backing PDF (file=null) — opening one jumps to the
 * prepare view with a placeholder canvas. This mirrors the demo/fixture data
 * used in `Design-Guide/ui_kits/dashboard/Dashboard.jsx`.
 */
const SEED_DOCUMENTS: ReadonlyArray<AppDocument> = [
  {
    id: 'd1',
    title: 'Master services agreement',
    code: 'DOC-8F3A',
    status: 'awaiting-others',
    fields: [],
    signers: [{ id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' }],
    updatedAt: '2026-04-18T10:00:00.000Z',
    file: null,
    totalPages: 8,
  },
  {
    id: 'd2',
    title: 'NDA — Quill Capital',
    code: 'DOC-02B1',
    status: 'awaiting-you',
    fields: [],
    signers: [{ id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' }],
    updatedAt: '2026-04-20T14:30:00.000Z',
    file: null,
    totalPages: 3,
  },
  {
    id: 'd3',
    title: 'Offer letter — M. Chen',
    code: 'DOC-771A',
    status: 'completed',
    fields: [],
    signers: [{ id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' }],
    updatedAt: '2026-04-14T09:15:00.000Z',
    file: null,
    totalPages: 2,
  },
  {
    id: 'd4',
    title: 'Consulting agreement',
    code: 'DOC-4C0F',
    status: 'completed',
    fields: [],
    signers: [{ id: 'c5', name: 'Priya Kapoor', email: 'priya@kapoor.com', color: '#818CF8' }],
    updatedAt: '2026-04-11T16:40:00.000Z',
    file: null,
    totalPages: 5,
  },
  {
    id: 'd5',
    title: 'Vendor onboarding — Argus',
    code: 'DOC-5E70',
    status: 'draft',
    fields: [],
    signers: [],
    updatedAt: '2026-04-08T11:00:00.000Z',
    file: null,
    totalPages: 4,
  },
];

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function shortCode(): string {
  return `DOC-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function nextColor(currentCount: number): string {
  return SIGNER_COLOR_PALETTE[currentCount % SIGNER_COLOR_PALETTE.length] ?? '#818CF8';
}

export interface AppStateProviderProps {
  readonly children: ReactNode;
}

/**
 * Holds the in-memory application state shared across pages (documents,
 * contacts, user). Lives above the router so navigation doesn't reset state.
 *
 * Intentionally small and ephemeral — this is a front-end-only demo with no
 * persistence. Producers that would wire a real backend would swap this
 * provider for a React Query / Zustand / RTK store without having to change
 * any page components, since consumers only ever go through
 * `useAppState()`.
 */
export function AppStateProvider(props: AppStateProviderProps) {
  const { children } = props;
  const [documents, setDocuments] = useState<ReadonlyArray<AppDocument>>(SEED_DOCUMENTS);
  const [contacts, setContacts] = useState<ReadonlyArray<AddSignerContact>>(SEED_CONTACTS);

  const getDocument = useCallback(
    (id: string): AppDocument | undefined => documents.find((d) => d.id === id),
    [documents],
  );

  const createDocument = useCallback((file: File, totalPages: number): string => {
    const id = nextId('d');
    const nowIso = new Date().toISOString();
    const baseTitle = file.name.replace(/\.pdf$/i, '');
    setDocuments((prev) => [
      {
        id,
        title: baseTitle || 'Untitled document',
        code: shortCode(),
        status: 'draft',
        fields: [],
        signers: [],
        updatedAt: nowIso,
        file,
        totalPages,
      },
      ...prev,
    ]);
    return id;
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<AppDocument>): void => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const sendDocument = useCallback((id: string): void => {
    const nowIso = new Date().toISOString();
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'awaiting-others', updatedAt: nowIso } : d)),
    );
  }, []);

  const deleteDocument = useCallback((id: string): void => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const addContact = useCallback(
    (name: string, email: string): AddSignerContact => {
      const id = nextId('c');
      const color = nextColor(contacts.length);
      const contact: AddSignerContact = { id, name, email, color };
      setContacts((prev) => [...prev, contact]);
      return contact;
    },
    [contacts.length],
  );

  const updateContact = useCallback(
    (id: string, patch: { name?: string; email?: string }): void => {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, name: patch.name ?? c.name, email: patch.email ?? c.email } : c,
        ),
      );
    },
    [],
  );

  const removeContact = useCallback((id: string): void => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      user: USER,
      documents,
      contacts,
      getDocument,
      createDocument,
      updateDocument,
      sendDocument,
      deleteDocument,
      addContact,
      updateContact,
      removeContact,
    }),
    [
      documents,
      contacts,
      getDocument,
      createDocument,
      updateDocument,
      sendDocument,
      deleteDocument,
      addContact,
      updateContact,
      removeContact,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be called inside <AppStateProvider>');
  }
  return value;
}
