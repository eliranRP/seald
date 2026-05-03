import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '@/lib/api/apiClient';

/**
 * Wire DTOs for the WT-D Drive doc → PDF conversion endpoints. Mirrors
 * `apps/api/src/integrations/gdrive/conversion/dto/conversion.dto.ts`.
 *
 * The WT-D 6-code error vocabulary (the WT-A-1 contract) is reflected in
 * `ConversionErrorCode` — `cancelled` is added on top because the SPA
 * tracks its own DELETE-issued cancellation as a terminal state even
 * though the backend exposes it as the `cancelled` job status.
 */
export type ConversionJobStatus = 'pending' | 'converting' | 'done' | 'failed' | 'cancelled';

export type ConversionErrorCode =
  | 'token-expired'
  | 'oauth-declined'
  | 'no-files-match-filter'
  | 'conversion-failed'
  | 'file-too-large'
  | 'unsupported-mime'
  | 'rate-limited'
  /**
   * Synthesized client-side when the SPA issues DELETE on the job — the
   * orchestrator surfaces it as a benign close (no failure dialog).
   */
  | 'cancelled';

export interface ConversionStartRequest {
  readonly accountId: string;
  readonly fileId: string;
  readonly mimeType: string;
}

export interface ConversionStartResponse {
  readonly jobId: string;
  readonly status: ConversionJobStatus;
}

export interface ConversionJobView {
  readonly jobId: string;
  readonly status: ConversionJobStatus;
  readonly assetUrl?: string;
  readonly errorCode?: ConversionErrorCode;
}

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function startConversion(
  body: ConversionStartRequest,
  signal?: AbortSignal,
): Promise<ConversionStartResponse> {
  const { data } = await apiClient.post<ConversionStartResponse>(
    '/integrations/gdrive/conversion',
    body,
    configWithSignal(signal),
  );
  return data;
}

export async function pollConversion(
  jobId: string,
  signal?: AbortSignal,
): Promise<ConversionJobView> {
  const { data } = await apiClient.get<ConversionJobView>(
    `/integrations/gdrive/conversion/${encodeURIComponent(jobId)}`,
    configWithSignal(signal),
  );
  return data;
}

export async function cancelConversion(jobId: string): Promise<void> {
  await apiClient.delete(`/integrations/gdrive/conversion/${encodeURIComponent(jobId)}`);
}

/**
 * Mime types treated as direct PDFs (no conversion-step required on the
 * server). The API's `conversion.service.ts` short-circuits PDF mime to
 * a `files.get(alt=media)` passthrough but still surfaces the bytes via
 * the same `assetUrl` job contract — the SPA does NOT need a separate
 * code path for PDFs vs. Docs vs. Docx.
 */
export const PDF_MIME = 'application/pdf';

/**
 * Fetches the converted PDF bytes from the signed `assetUrl` returned
 * by `pollConversion` once `status === 'done'`. The asset URL is a
 * short-lived signed URL — the SPA must consume it promptly. Uses raw
 * `fetch` rather than `apiClient` because the asset is hosted off the
 * Nest API host (object storage / signed URL).
 */
export async function fetchConvertedPdf(assetUrl: string): Promise<Blob> {
  const resp = await fetch(assetUrl, { credentials: 'omit' });
  if (!resp.ok) {
    throw new Error(`asset_fetch_failed_${resp.status}`);
  }
  return resp.blob();
}
