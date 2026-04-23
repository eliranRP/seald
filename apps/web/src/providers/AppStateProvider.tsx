import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { SIGNER_COLOR_PALETTE, fetchDocuments } from '../lib/mockApi';
import type { AppDocument, AppUser } from '../lib/mockApi';
import {
  useContactsQuery,
  useCreateContactMutation,
  useDeleteContactMutation,
  useUpdateContactMutation,
} from '../features/contacts';
import { useMinDuration } from '../lib/useMinDuration';
import { useAuth } from './AuthProvider';

export type { AppDocument, AppUser, DocumentSigner, DocumentStatus } from '../lib/mockApi';

export interface AppStateValue {
  /**
   * The signed-in user, mirrored from `AuthProvider`. `null` for guests and
   * anonymous visitors (the latter never reach a page that reads this).
   */
  readonly user: AppUser | null;
  readonly documents: ReadonlyArray<AppDocument>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** True until the initial contacts/documents fetch resolves. */
  readonly loading: boolean;
  /** True until the initial contacts fetch resolves. `false` for guests. */
  readonly contactsLoading: boolean;
  /** True until the initial documents fetch resolves. `false` for guests. */
  readonly documentsLoading: boolean;
  readonly getDocument: (id: string) => AppDocument | undefined;
  readonly createDocument: (file: File, totalPages: number) => string;
  readonly updateDocument: (id: string, patch: Partial<AppDocument>) => void;
  readonly sendDocument: (id: string) => void;
  readonly deleteDocument: (id: string) => void;
  readonly addContact: (name: string, email: string) => Promise<AddSignerContact>;
  readonly updateContact: (id: string, patch: { name?: string; email?: string }) => Promise<void>;
  readonly removeContact: (id: string) => Promise<void>;
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
 * - `user` is mirrored from `AuthProvider` (Supabase session).
 * - `contacts` comes from the Nest API via React-Query; fetched when the
 *   user is signed in, empty for guests and anonymous visitors. All three
 *   contact mutators delegate to the corresponding React-Query mutation
 *   hooks (optimistic update + rollback-on-error baked in) so consumers
 *   keep the same small imperative surface they had before.
 * - `documents` still comes from the local mock API until that resource is
 *   swapped to a server-backed endpoint.
 */
export function AppStateProvider(props: AppStateProviderProps) {
  const { children } = props;
  const { user: authUser } = useAuth();
  const [documents, setDocuments] = useState<ReadonlyArray<AppDocument>>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);

  const contactsEnabled = Boolean(authUser);
  const contactsQuery = useContactsQuery(contactsEnabled);
  const createContactMutation = useCreateContactMutation();
  const updateContactMutation = useUpdateContactMutation();
  const deleteContactMutation = useDeleteContactMutation();

  useEffect(() => {
    if (!authUser) {
      setDocuments([]);
      setDocumentsLoading(false);
      return () => {};
    }
    let cancelled = false;
    setDocumentsLoading(true);
    fetchDocuments()
      .then((fetchedDocuments) => {
        if (cancelled) return;
        setDocuments(fetchedDocuments);
        setDocumentsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDocuments([]);
          setDocumentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const user = useMemo<AppUser | null>(() => {
    if (!authUser) return null;
    return {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      avatarUrl: authUser.avatarUrl,
    };
  }, [authUser]);

  const contacts = useMemo<ReadonlyArray<AddSignerContact>>(
    () => (authUser ? (contactsQuery.data ?? []) : []),
    [authUser, contactsQuery.data],
  );

  // Per-resource loading flags so pages can show targeted skeletons instead
  // of a single coarse "loading" spinner. The top-level `loading` stays true
  // until both have resolved (backwards compatible with existing callers).
  //
  // Both flags are held "true" for a minimum of 2 seconds by `useMinDuration`.
  // Cached react-query reads and the ~10 ms mock-API fetch can resolve faster
  // than the skeleton animation loop, which flashes the UI; enforcing a
  // minimum visible window keeps the loading state readable without slowing
  // any real network work.
  const contactsLoading = useMinDuration(contactsEnabled && contactsQuery.isPending, 2000);
  const documentsLoadingHeld = useMinDuration(documentsLoading, 2000);
  const loading = documentsLoadingHeld || contactsLoading;

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
    async (name: string, email: string): Promise<AddSignerContact> => {
      const color = nextColor(contacts.length);
      const saved = await createContactMutation.mutateAsync({ name, email, color });
      return saved;
    },
    [contacts.length, createContactMutation],
  );

  const updateContact = useCallback(
    async (id: string, patch: { name?: string; email?: string }): Promise<void> => {
      await updateContactMutation.mutateAsync({ id, patch });
    },
    [updateContactMutation],
  );

  const removeContact = useCallback(
    async (id: string): Promise<void> => {
      await deleteContactMutation.mutateAsync(id);
    },
    [deleteContactMutation],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      documents,
      contacts,
      loading,
      contactsLoading,
      documentsLoading: documentsLoadingHeld,
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
      contactsLoading,
      documentsLoadingHeld,
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
