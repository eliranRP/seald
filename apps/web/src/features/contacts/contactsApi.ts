import type { AxiosRequestConfig } from 'axios';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import { apiClient } from '../../lib/api/apiClient';

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
}

function toAddSignerContact(c: ApiContact): AddSignerContact {
  return { id: c.id, name: c.name, email: c.email, color: c.color };
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
