import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { BulkBatch, BulkSchema } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

/** How often the progress view re-reads a batch that is still sending. */
export const BULK_POLL_MS = 3000;

/**
 * An error from the bulk routes with the API's slug (`{ error: 'bulk_…' }`).
 * The shared `apiClient` keeps only the HTTP status text, which is empty on
 * HTTP/2, so these calls read the body themselves.
 */
export class BulkApiError extends Error {
  constructor(
    readonly slug: string,
    readonly status: number,
  ) {
    super(slug);
    this.name = 'BulkApiError';
  }
}

function slugOf(res: AxiosResponse<unknown>): string {
  const data = res.data as { readonly error?: unknown } | null;
  return typeof data?.error === 'string' ? data.error : 'request_failed';
}

async function send<T>(
  method: 'get' | 'post',
  url: string,
  body?: unknown,
  config: AxiosRequestConfig = {},
): Promise<T> {
  const res = await apiClient.request<unknown>({
    method,
    url,
    ...(body !== undefined ? { data: body } : {}),
    ...config,
    // Read the error body instead of letting the client reduce it to a status text.
    validateStatus: () => true,
  });
  if (res.status >= 400) throw new BulkApiError(slugOf(res), res.status);
  return res.data as T;
}

export const bulkKeys = {
  schema: (templateId: string) => ['bulk-send', 'schema', templateId] as const,
  batch: (batchId: string) => ['bulk-send', 'batch', batchId] as const,
};

export interface UploadBulkInput {
  readonly templateId: string;
  readonly file: File;
  /** Days until each envelope expires; omitted keeps the default. */
  readonly expiresInDays?: number | undefined;
}

export function fetchBulkSchema(templateId: string): Promise<BulkSchema> {
  return send<BulkSchema>('get', `/templates/${encodeURIComponent(templateId)}/bulk-schema`);
}

export function uploadBulkCsv(input: UploadBulkInput): Promise<BulkBatch> {
  const form = new FormData();
  form.append('file', input.file);
  if (input.expiresInDays !== undefined) {
    form.append('expires_in_days', String(input.expiresInDays));
  }
  return send<BulkBatch>(
    'post',
    `/templates/${encodeURIComponent(input.templateId)}/bulk-batches`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

export function fetchBulkBatch(batchId: string): Promise<BulkBatch> {
  return send<BulkBatch>('get', `/bulk-batches/${encodeURIComponent(batchId)}`);
}

/** A batch is still moving while it is being sent. */
export function isBatchActive(batch: BulkBatch | undefined): boolean {
  return batch?.status === 'processing';
}

export function useBulkSchema(templateId: string) {
  return useQuery<BulkSchema, BulkApiError>({
    queryKey: bulkKeys.schema(templateId),
    queryFn: () => fetchBulkSchema(templateId),
    retry: false,
  });
}

/** Reads one batch and re-reads it every few seconds while it is sending. */
export function useBulkBatch(batchId: string | undefined) {
  return useQuery<BulkBatch, BulkApiError>({
    queryKey: bulkKeys.batch(batchId ?? ''),
    queryFn: () => fetchBulkBatch(batchId ?? ''),
    enabled: batchId !== undefined,
    retry: false,
    refetchInterval: (query) => (isBatchActive(query.state.data) ? BULK_POLL_MS : false),
  });
}

export function useUploadBulkCsv() {
  const qc = useQueryClient();
  return useMutation<BulkBatch, BulkApiError, UploadBulkInput>({
    mutationFn: uploadBulkCsv,
    onSuccess: (batch) => {
      qc.setQueryData(bulkKeys.batch(batch.id), batch);
    },
  });
}

function useBatchAction(action: 'confirm' | 'cancel') {
  const qc = useQueryClient();
  return useMutation<BulkBatch, BulkApiError, string>({
    mutationFn: (batchId) =>
      send<BulkBatch>('post', `/bulk-batches/${encodeURIComponent(batchId)}/${action}`),
    onSuccess: (batch) => {
      qc.setQueryData(bulkKeys.batch(batch.id), batch);
    },
  });
}

export const useConfirmBulk = () => useBatchAction('confirm');
export const useCancelBulk = () => useBatchAction('cancel');
