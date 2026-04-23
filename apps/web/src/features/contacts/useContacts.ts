import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import { createContact, deleteContact, listContacts, updateContactApi } from './contactsApi';
import type { CreateContactInput, UpdateContactInput } from './contactsApi';

/**
 * Query key for the authenticated user's contact list. Exported so callers
 * (mutations, manual invalidation, tests) can reference the same tuple.
 */
export const CONTACTS_KEY = ['contacts'] as const;

/**
 * Loads the signed-in user's contacts from the API. Pass `enabled: false`
 * (e.g. for guests or before the session hydrates) to skip the fetch.
 *
 * React-Query passes an `AbortSignal` to every `queryFn`; we hand it down
 * to axios so the HTTP request is aborted when the component unmounts or
 * a new query supersedes this one.
 */
export function useContactsQuery(enabled: boolean) {
  return useQuery<ReadonlyArray<AddSignerContact>>({
    queryKey: CONTACTS_KEY,
    queryFn: ({ signal }) => listContacts(signal),
    enabled,
  });
}

/**
 * Mutation hook for `POST /contacts`. Performs an optimistic insert with a
 * temporary id and reconciles with the server-assigned row on success; on
 * failure the temp row is dropped and the error bubbles to callers.
 */
export function useCreateContactMutation() {
  const qc = useQueryClient();
  return useMutation<AddSignerContact, Error, CreateContactInput, { readonly tempId: string }>({
    mutationFn: (input) => createContact(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: CONTACTS_KEY });
      const tempId = `c_tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: AddSignerContact = {
        id: tempId,
        name: input.name,
        email: input.email,
        color: input.color,
      };
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        prev ? [...prev, optimistic] : [optimistic],
      );
      return { tempId };
    },
    onSuccess: (saved, _input, ctx) => {
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        (prev ?? []).map((c) => (c.id === ctx?.tempId ? saved : c)),
      );
    },
    onError: (_err, _input, ctx) => {
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        (prev ?? []).filter((c) => c.id !== ctx?.tempId),
      );
    },
  });
}

export interface UpdateContactArgs {
  readonly id: string;
  readonly patch: UpdateContactInput;
}

/**
 * Mutation hook for `PATCH /contacts/:id`. Optimistic swap-and-restore.
 */
export function useUpdateContactMutation() {
  const qc = useQueryClient();
  return useMutation<
    AddSignerContact,
    Error,
    UpdateContactArgs,
    { readonly previous: ReadonlyArray<AddSignerContact> | undefined }
  >({
    mutationFn: ({ id, patch }) => updateContactApi(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: CONTACTS_KEY });
      const previous = qc.getQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY);
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        (prev ?? []).map((c) =>
          c.id === id
            ? {
                ...c,
                name: patch.name ?? c.name,
                email: patch.email ?? c.email,
                color: patch.color ?? c.color,
              }
            : c,
        ),
      );
      return { previous };
    },
    onSuccess: (saved) => {
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        (prev ?? []).map((c) => (c.id === saved.id ? saved : c)),
      );
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(CONTACTS_KEY, ctx.previous);
    },
  });
}

/**
 * Mutation hook for `DELETE /contacts/:id`. Optimistic remove-and-restore.
 */
export function useDeleteContactMutation() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    string,
    { readonly previous: ReadonlyArray<AddSignerContact> | undefined }
  >({
    mutationFn: (id) => deleteContact(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CONTACTS_KEY });
      const previous = qc.getQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY);
      qc.setQueryData<ReadonlyArray<AddSignerContact>>(CONTACTS_KEY, (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(CONTACTS_KEY, ctx.previous);
    },
  });
}
