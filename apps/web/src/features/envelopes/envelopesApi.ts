import type { AxiosRequestConfig } from 'axios';
import type { EnvelopeListItem } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

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
  readonly tags: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EnvelopeListResponse {
  readonly items: ReadonlyArray<EnvelopeListItem>;
  readonly next_cursor: string | null;
}

/**
 * Server-side sort keys accepted by `GET /envelopes`. `signers` orders
 * by signer count, `progress` by the completed/total ratio; the rest
 * map to `envelopes` columns. `title` is the dashboard's "Document"
 * column.
 */
export type EnvelopeSortKey = 'date' | 'created' | 'title' | 'status' | 'signers' | 'progress';
export type EnvelopeSortDir = 'asc' | 'desc';

/** Dashboard status buckets — the `?bucket=` query-param vocabulary. */
export type EnvelopeBucket = 'draft' | 'awaiting_you' | 'awaiting_others' | 'sealed' | 'declined';

export interface ListEnvelopesParams {
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  readonly limit?: number;
  readonly cursor?: string;
  readonly sort?: EnvelopeSortKey;
  readonly dir?: EnvelopeSortDir;
  // Dashboard filters (server applies these in SQL).
  readonly q?: string;
  readonly bucket?: ReadonlyArray<EnvelopeBucket>;
  /** Preset keyword or `custom:YYYY-MM-DD:YYYY-MM-DD`. */
  readonly date?: string;
  readonly signer?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
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
  if (params.sort) query.set('sort', params.sort);
  if (params.dir) query.set('dir', params.dir);
  if (params.q) query.set('q', params.q);
  if (params.bucket?.length) query.set('bucket', params.bucket.join(','));
  if (params.date) query.set('date', params.date);
  if (params.signer?.length) query.set('signer', params.signer.join(','));
  if (params.tags?.length) query.set('tags', params.tags.join(','));
  const q = query.toString();
  const url = q ? `/envelopes?${q}` : '/envelopes';
  const { data } = await apiClient.get<EnvelopeListResponse>(url, configWithSignal(signal));
  return data;
}

export async function getEnvelope(id: string, signal?: AbortSignal): Promise<Envelope> {
  const { data } = await apiClient.get<Envelope>(`/envelopes/${id}`, configWithSignal(signal));
  return data;
}

export interface PatchEnvelopeInput {
  readonly title?: string;
  readonly expires_at?: string;
  /**
   * Whole-array replace. The server normalises (lowercase + trim
   * + dedupe) and enforces the 10 × 32-char caps; clients can
   * send the user-typed values verbatim.
   */
  readonly tags?: ReadonlyArray<string>;
}

export async function patchEnvelope(
  id: string,
  patch: PatchEnvelopeInput,
  signal?: AbortSignal,
): Promise<Envelope> {
  const { data } = await apiClient.patch<Envelope>(
    `/envelopes/${id}`,
    patch,
    configWithSignal(signal),
  );
  return data;
}

export type EnvelopeEventType =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'tc_accepted'
  | 'field_filled'
  | 'signed'
  | 'all_signed'
  | 'sealed'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'reminder_sent'
  | 'session_invalidated_by_decline'
  | 'session_invalidated_by_cancel'
  | 'job_failed'
  | 'retention_deleted';

export interface EnvelopeEvent {
  readonly id: string;
  readonly envelope_id: string;
  readonly signer_id: string | null;
  readonly actor_kind: 'sender' | 'signer' | 'system';
  readonly event_type: EnvelopeEventType;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
}

export interface EnvelopeEventsResponse {
  readonly events: ReadonlyArray<EnvelopeEvent>;
}

export async function listEnvelopeEvents(
  id: string,
  signal?: AbortSignal,
): Promise<EnvelopeEventsResponse> {
  const { data } = await apiClient.get<EnvelopeEventsResponse>(
    `/envelopes/${id}/events`,
    configWithSignal(signal),
  );
  return data;
}

export type EnvelopeDownloadKind = 'sealed' | 'original' | 'audit';

export interface EnvelopeDownloadUrl {
  readonly url: string;
  readonly kind: EnvelopeDownloadKind;
}

/**
 * Returns a short-lived (5 min) signed URL for one of the envelope's
 * PDF artifacts. `kind`:
 *   - omitted → sealed if available, else original (the default CTA).
 *   - `'sealed'`   → the sealed signed-by-all artifact.
 *   - `'original'` → the uploaded PDF.
 *   - `'audit'`    → the audit-trail PDF produced by the sealing job.
 *
 * Callers open `url` in a new tab (or anchor-click it) to trigger the
 * download.
 */
export async function getEnvelopeDownloadUrl(
  id: string,
  kind?: EnvelopeDownloadKind,
  signal?: AbortSignal,
): Promise<EnvelopeDownloadUrl> {
  const base = configWithSignal(signal) ?? {};
  const params = kind !== undefined ? { ...(base.params ?? {}), kind } : base.params;
  const config = params !== undefined ? { ...base, params } : base;
  const { data } = await apiClient.get<EnvelopeDownloadUrl>(`/envelopes/${id}/download`, config);
  return data;
}

/**
 * Re-sends the signing invite to a single signer, rotating their token
 * so any previous link goes dead. Backend enforces a 1-per-hour throttle
 * per (envelope, signer) pair; a 429 surfaces as a
 * `remind_throttled` slug.
 */
export async function remindEnvelopeSigner(
  envelopeId: string,
  signerId: string,
  payload?: SendEnvelopePayload,
  signal?: AbortSignal,
): Promise<void> {
  const body: { sender_email?: string; sender_name?: string } = {};
  if (payload?.sender_email !== undefined) body.sender_email = payload.sender_email;
  if (payload?.sender_name !== undefined) body.sender_name = payload.sender_name;
  await apiClient.post<void>(
    `/envelopes/${envelopeId}/signers/${signerId}/remind`,
    body,
    configWithSignal(signal),
  );
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

/**
 * Two payload shapes are accepted by the API (see
 * `apps/api/src/envelopes/dto/add-signer.dto.ts`):
 *
 *   - Contact-backed: `{ contact_id }`              — sender selected a saved contact
 *   - Ad-hoc:        `{ email, name, color? }`     — guest mode, no contacts table row
 */
export type AddEnvelopeSignerInput =
  | { readonly contact_id: string }
  | {
      readonly email: string;
      readonly name: string;
      readonly color?: string;
    };

export async function addEnvelopeSigner(
  envelopeId: string,
  input: AddEnvelopeSignerInput,
  signal?: AbortSignal,
): Promise<EnvelopeSigner> {
  const { data } = await apiClient.post<EnvelopeSigner>(
    `/envelopes/${envelopeId}/signers`,
    input,
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

export interface SendEnvelopePayload {
  /**
   * Caller-supplied sender email. Server uses this only when the JWT has
   * no `email` claim (anonymous Supabase sessions used by guest mode);
   * when the JWT carries an email, the server ignores this and uses the
   * JWT email instead (anti-spoofing).
   */
  readonly sender_email?: string;
  readonly sender_name?: string;
}

export async function sendEnvelope(
  id: string,
  payload?: SendEnvelopePayload,
  signal?: AbortSignal,
): Promise<Envelope> {
  const body: { sender_email?: string; sender_name?: string } = {};
  if (payload?.sender_email !== undefined) body.sender_email = payload.sender_email;
  if (payload?.sender_name !== undefined) body.sender_name = payload.sender_name;
  const { data } = await apiClient.post<Envelope>(
    `/envelopes/${id}/send`,
    body,
    configWithSignal(signal),
  );
  return data;
}

export async function deleteEnvelope(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.delete(`/envelopes/${id}`, configWithSignal(signal));
}

export interface CancelEnvelopeResponse {
  readonly status: 'canceled';
  readonly envelope_status: 'canceled';
}

/**
 * Sender-initiated cancel ("withdraw") of a sent envelope. Allowed only on
 * `awaiting_others` / `sealing`; terminal statuses surface as 409. Use the
 * delete-draft flow for `draft` envelopes.
 */
export async function cancelEnvelope(
  id: string,
  signal?: AbortSignal,
): Promise<CancelEnvelopeResponse> {
  const { data } = await apiClient.post<CancelEnvelopeResponse>(
    `/envelopes/${id}/cancel`,
    undefined,
    configWithSignal(signal),
  );
  return data;
}
