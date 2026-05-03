import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '@/lib/api/apiClient';
import type { DriveFile, DriveMimeFilter } from './DrivePicker.types';

/**
 * Wire shape of `GET /integrations/gdrive/files`. The server already
 * filters by `mimeFilter`; the client re-filters via
 * {@link SUPPORTED_MIME_TYPES} as defence in depth.
 */
export interface DriveFilesResponse {
  readonly files: ReadonlyArray<DriveFile>;
}

export interface ListDriveFilesArgs {
  readonly accountId: string;
  readonly mimeFilter: DriveMimeFilter;
  readonly signal?: AbortSignal;
}

/**
 * Allow-list mirroring the server's mime allow-list. Anything outside
 * this set is dropped on the client too, so a future server bug can't
 * smuggle (e.g.) a `.exe` row into the picker UI.
 */
export const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

/**
 * Fetches one page of Drive files from the API proxy. Errors with HTTP
 * status 401 + body `{ code: 'token-expired' }` are surfaced as plain
 * `ApiError` (status 401) — `useDriveFiles` maps that to the
 * Reconnect state.
 */
export async function listDriveFiles(args: ListDriveFilesArgs): Promise<DriveFilesResponse> {
  const { accountId, mimeFilter, signal } = args;
  const { data } = await apiClient.get<DriveFilesResponse>('/integrations/gdrive/files', {
    ...configWithSignal(signal),
    params: { accountId, mimeFilter },
  });
  // Defence-in-depth: drop any file whose mime escapes the allow-list.
  // `data.files` is `ReadonlyArray`; `.filter` returns a fresh array so
  // we never mutate the response React-Query caches.
  const safeFiles = data.files.filter((f) => SUPPORTED_MIME_TYPES.has(f.mimeType));
  return { files: safeFiles };
}
