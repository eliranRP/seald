import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import {
  SIGNER_COLOR_PALETTE,
  fetchContacts,
  fetchCurrentUser,
  fetchDocuments,
} from '../lib/mockApi';
import type { AppDocument, AppUser } from '../lib/mockApi';

export type { AppDocument, AppUser, DocumentSigner, DocumentStatus } from '../lib/mockApi';

export interface AppStateValue {
  /** Null while the initial fetch is in flight. */
  readonly user: AppUser | null;
  readonly documents: ReadonlyArray<AppDocument>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** True until the initial parallel fetch for user/contacts/documents resolves. */
  readonly loading: boolean;
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
 * Initial data is fetched in parallel from `src/lib/mockApi` on mount, which
 * simulates the eventual real server. Until those resolve, `loading` is true,
 * `user` is null, and the `documents`/`contacts` lists are empty. Mutator
 * callbacks (createDocument, addContact, …) remain purely in-memory — a real
 * implementation would swap them for POST/PATCH calls without changing the
 * consumer surface.
 */
export function AppStateProvider(props: AppStateProviderProps) {
  const { children } = props;
  const [user, setUser] = useState<AppUser | null>(null);
  const [documents, setDocuments] = useState<ReadonlyArray<AppDocument>>([]);
  const [contacts, setContacts] = useState<ReadonlyArray<AddSignerContact>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCurrentUser(), fetchContacts(), fetchDocuments()])
      .then(([fetchedUser, fetchedContacts, fetchedDocuments]) => {
        if (cancelled) {
          return;
        }
        setUser(fetchedUser);
        setContacts(fetchedContacts);
        setDocuments(fetchedDocuments);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      user,
      documents,
      contacts,
      loading,
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
      user,
      documents,
      contacts,
      loading,
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
