import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import { SIGNER_COLOR_PALETTE } from '../lib/mockApi';
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
  /**
   * In-memory **draft** store for the authoring editor. Holds the raw `File`,
   * the placed fields (pixel coords), and the picked signer contacts while
   * the user is composing an envelope. Lives here rather than in the
   * editor's route state so navigating between upload → document → sent
   * doesn't lose the draft. The dashboard does NOT read this — it lists
   * envelopes straight from `/envelopes` via React-Query.
   */
  readonly documents: ReadonlyArray<AppDocument>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  /** True until the initial contacts fetch resolves. `false` for guests. */
  readonly loading: boolean;
  readonly contactsLoading: boolean;
  /**
   * Kept `false` — documents no longer come from a remote fetch at this
   * layer; the authoritative source is the dashboard's `useEnvelopesQuery`.
   * The flag is preserved for backward-compat with page code that still
   * reads it.
   */
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
 * Holds the in-memory application state shared across pages (draft
 * documents, contacts, user). Lives above the router so navigation doesn't
 * reset state.
 *
 * - `user` is mirrored from `AuthProvider` (Supabase session).
 * - `contacts` comes from the Nest API via React-Query. Mutators delegate
 *   to the contact mutation hooks.
 * - `documents` is a purely **client-side draft store** populated when the
 *   user uploads a PDF and cleared after the draft is sent to the server.
 *   The dashboard reads envelopes directly from `/envelopes`; this store
 *   exists only to carry the raw `File` + in-progress fields between the
 *   upload and document-editor routes.
 */
export function AppStateProvider(props: AppStateProviderProps) {
  const { children } = props;
  const { user: authUser } = useAuth();
  const [documents, setDocuments] = useState<ReadonlyArray<AppDocument>>([]);

  const contactsEnabled = Boolean(authUser);
  const contactsQuery = useContactsQuery(contactsEnabled);
  const createContactMutation = useCreateContactMutation();
  const updateContactMutation = useUpdateContactMutation();
  const deleteContactMutation = useDeleteContactMutation();

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

  const contactsLoading = useMinDuration(contactsEnabled && contactsQuery.isPending, 2000);
  // Preserved for back-compat with consumers that still read the flag.
  // Drafts live in memory only; there is no network fetch to block on.
  const documentsLoading = false;
  const loading = contactsLoading;

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
    // Mark the local draft as awaiting-others so SentConfirmationPage can
    // keep rendering the handoff summary. The server-authoritative record
    // lives under `/envelopes/:id` once `useSendEnvelope` publishes the
    // draft; the dashboard will show it on next refetch.
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
      documentsLoading,
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
      documentsLoading,
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
