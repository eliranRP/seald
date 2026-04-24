import type { AxiosRequestConfig } from 'axios';
import type { EnvelopeListItem } from 'shared';
import { apiClient } from '../../lib/api/apiClient';

/* ---------------- Wire-level types (mirror the Nest responses) ---------------- */

export type EnvelopeStatus =
  | 'draft'
  | 'awaiting_others'
  | 'sealing'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';

export type SignerRole = 'proposer' | 'signatory' | 'validator' | 'witness';
export type SignerUiStatus = 'awaiting' | 'viewing' | 'completed' | 'declined';
export type FieldKind = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'email';

export interface EnvelopeSigner {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly color: string;
  readonly role: SignerRole;
  readonly signing_order: number;
  readonly status: SignerUiStatus;
  readonly viewed_at: string | null;
  readonly tc_accepted_at: string | null;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
}

export interface EnvelopeField {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required: boolean;
  readonly link_id?: string | null;
}

export interface Envelope {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly short_code: string;
  readonly status: EnvelopeStatus;
  readonly original_pages: number | null;
  readonly expires_at: string;
  readonly tc_version: string;
  readonly privacy_version: string;
  readonly sent_at: string | null;
  readonly completed_at: string | null;
  readonly signers: ReadonlyArray<EnvelopeSigner>;
  readonly fields: ReadonlyArray<EnvelopeField>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EnvelopeListResponse {
  readonly items: ReadonlyArray<EnvelopeListItem>;
  readonly next_cursor: string | null;
}

export interface ListEnvelopesParams {
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface FieldPlacement {
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  /** Normalized (0–1) coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required?: boolean;
  readonly link_id?: string | null;
}

/* ---------------- Wire functions ---------------- */

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function listEnvelopes(
  params: ListEnvelopesParams = {},
  signal?: AbortSignal,
): Promise<EnvelopeListResponse> {
  const query = new URLSearchParams();
  if (params.statuses?.length) query.set('status', params.statuses.join(','));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const q = query.toString();
  const url = q ? `/envelopes?${q}` : '/envelopes';
  const { data } = await apiClient.get<EnvelopeListResponse>(url, configWithSignal(signal));
  return data;
}

export async function getEnvelope(id: string, signal?: AbortSignal): Promise<Envelope> {
  const { data } = await apiClient.get<Envelope>(`/envelopes/${id}`, configWithSignal(signal));
  return data;
}

export async function createEnvelope(
  input: { readonly title: string },
  signal?: AbortSignal,
): Promise<Envelope> {
  const { data } = await apiClient.post<Envelope>('/envelopes', input, configWithSignal(signal));
  return data;
}

export async function uploadEnvelopeFile(
  id: string,
  file: File | Blob,
  signal?: AbortSignal,
): Promise<{ readonly pages: number; readonly sha256: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const config: AxiosRequestConfig = {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  };
  const { data } = await apiClient.post<{ pages: number; sha256: string }>(
    `/envelopes/${id}/upload`,
    fd,
    config,
  );
  return data;
}

export async function addEnvelopeSigner(
  envelopeId: string,
  contactId: string,
  signal?: AbortSignal,
): Promise<EnvelopeSigner> {
  const { data } = await apiClient.post<EnvelopeSigner>(
    `/envelopes/${envelopeId}/signers`,
    { contact_id: contactId },
    configWithSignal(signal),
  );
  return data;
}

export async function removeEnvelopeSigner(
  envelopeId: string,
  signerId: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiClient.delete(`/envelopes/${envelopeId}/signers/${signerId}`, configWithSignal(signal));
}

export async function placeEnvelopeFields(
  envelopeId: string,
  fields: ReadonlyArray<FieldPlacement>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<EnvelopeField>> {
  const { data } = await apiClient.put<ReadonlyArray<EnvelopeField>>(
    `/envelopes/${envelopeId}/fields`,
    { fields },
    configWithSignal(signal),
  );
  return data;
}

export async function sendEnvelope(id: string, signal?: AbortSignal): Promise<Envelope> {
  const { data } = await apiClient.post<Envelope>(
    `/envelopes/${id}/send`,
    undefined,
    configWithSignal(signal),
  );
  return data;
}

export async function deleteEnvelope(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.delete(`/envelopes/${id}`, configWithSignal(signal));
}
