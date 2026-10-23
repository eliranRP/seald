import type { AxiosRequestConfig } from 'axios';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { apiClient } from '@/lib/api/apiClient';

/**
 * Shape the API returns for a single contact. Mirrors the Nest
 * `ContactsController` response. Only `id`, `name`, `email`, and `color`
 * flow through to the UI today; the owner/timestamp fields are preserved
 * on the wire so future callers can use them without a second fetch.
 */
export interface ApiContact {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
  /** `GET /contacts` only: sent envelopes listing this email. */
  readonly docs_count?: number;
  /** `GET /contacts` only: latest send to this email, ISO, or null. */
  readonly last_sent_at?: string | null;
}

function toAddSignerContact(c: ApiContact): AddSignerContact {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    color: c.color,
    ...(c.docs_count !== undefined ? { docsCount: c.docs_count } : {}),
    ...(c.last_sent_at !== undefined ? { lastSentAt: c.last_sent_at } : {}),
  };
}

/**
 * Every call accepts an optional `AbortSignal` so callers can cancel
 * in-flight requests — react-query hands one to its `queryFn`, and ad-hoc
 * consumers (e.g. the DebugAuthPage) can wire their own `AbortController`
 * to cancel on unmount.
 */
function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function listContacts(signal?: AbortSignal): Promise<ReadonlyArray<AddSignerContact>> {
  const { data } = await apiClient.get<ReadonlyArray<ApiContact>>(
    '/contacts',
    configWithSignal(signal),
  );
  return data.map(toAddSignerContact);
}

export interface CreateContactInput {
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export async function createContact(
  input: CreateContactInput,
  signal?: AbortSignal,
): Promise<AddSignerContact> {
  const { data } = await apiClient.post<ApiContact>('/contacts', input, configWithSignal(signal));
  return toAddSignerContact(data);
}

export interface UpdateContactInput {
  readonly name?: string;
  readonly email?: string;
  readonly color?: string;
}

export async function updateContactApi(
  id: string,
  patch: UpdateContactInput,
  signal?: AbortSignal,
): Promise<AddSignerContact> {
  const { data } = await apiClient.patch<ApiContact>(
    `/contacts/${id}`,
    patch,
    configWithSignal(signal),
  );
  return toAddSignerContact(data);
}

export async function deleteContact(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.delete(`/contacts/${id}`, configWithSignal(signal));
}

/** Result of `POST /contacts/bulk` (addresses are lower-cased by the server). */
export interface BulkCreateContactsResult {
  readonly created: ReadonlyArray<AddSignerContact>;
  readonly skippedDuplicate: ReadonlyArray<string>;
  readonly invalid: ReadonlyArray<string>;
}

/** Add many contacts from pasted addresses; the server guesses the names. */
export async function bulkCreateContacts(
  emails: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<BulkCreateContactsResult> {
  const { data } = await apiClient.post<{
    readonly created: ReadonlyArray<ApiContact>;
    readonly skipped_duplicate: ReadonlyArray<string>;
    readonly invalid: ReadonlyArray<string>;
  }>('/contacts/bulk', { emails }, configWithSignal(signal));
  return {
    created: data.created.map(toAddSignerContact),
    skippedDuplicate: data.skipped_duplicate,
    invalid: data.invalid,
  };
}

/** Soft-delete several contacts (Undo window: 24 hours). */
export async function deleteContacts(
  ids: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<void> {
  await apiClient.delete('/contacts', { ...configWithSignal(signal), data: { ids } });
}

/** Undo a delete. Returns the contacts that came back. */
export async function restoreContacts(
  ids: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<AddSignerContact>> {
  const { data } = await apiClient.post<ReadonlyArray<ApiContact>>(
    '/contacts/restore',
    { ids },
    configWithSignal(signal),
  );
  return data.map(toAddSignerContact);
}
