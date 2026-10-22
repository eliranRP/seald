import type { AxiosRequestConfig } from 'axios';
import type { EnvelopeDocument, EnvelopeDocumentListResponse } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

/**
 * Wire functions for `/envelopes/:id/documents` (WP-03, flag
 * `multiDocumentEnvelopes`). Every route 404s while the flag is off on the
 * API, so callers gate on the flag first.
 */

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

/**
 * Adds a PDF to a draft. The first upload fills the empty document 1;
 * later ones append. `title` defaults server-side to the file name.
 */
export async function addEnvelopeDocument(
  envelopeId: string,
  file: File | Blob,
  title?: string,
  signal?: AbortSignal,
): Promise<EnvelopeDocument> {
  const fd = new FormData();
  fd.append('file', file);
  if (title !== undefined) fd.append('title', title);
  const config: AxiosRequestConfig = {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  };
  const { data } = await apiClient.post<EnvelopeDocument>(
    `/envelopes/${envelopeId}/documents`,
    fd,
    config,
  );
  return data;
}

/** `PUT /envelopes/:id/documents/order` — every document id, once. */
export async function reorderEnvelopeDocuments(
  envelopeId: string,
  documentIds: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<EnvelopeDocument>> {
  const { data } = await apiClient.put<EnvelopeDocumentListResponse>(
    `/envelopes/${envelopeId}/documents/order`,
    { document_ids: documentIds },
    configWithSignal(signal),
  );
  return data.documents;
}

export async function removeEnvelopeDocument(
  envelopeId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiClient.delete(
    `/envelopes/${envelopeId}/documents/${documentId}`,
    configWithSignal(signal),
  );
}
