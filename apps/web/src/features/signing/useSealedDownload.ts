import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { verifyApiClient } from '@/lib/api/verifyApiClient';
import type { VerifyResponse } from '@/features/verify';

/**
 * Polling helper for the post-sign Done page so a recipient can download
 * the sealed PDF as soon as the API finishes sealing.
 *
 * Why a dedicated hook (and not `useVerifyEnvelope`):
 *   - `useVerifyEnvelope` is a one-shot read with `retry: false` and a
 *     60 s `staleTime` for the public verify page; both are wrong here.
 *   - The Done page lands in the brief window between `POST /sign/submit`
 *     (which transitions the envelope to `sealing`) and the seal worker
 *     completing (`completed`, sealed_url populated). Poll until the
 *     terminal status is reached, then stop.
 *
 * Caching key matches `useVerifyEnvelope`'s so a later visit to
 * `/verify/:short_code` reuses the same cached data.
 *
 * The query is `enabled` only when a non-empty `shortCode` is provided —
 * undefined snapshots (deep-link to /done) skip the network entirely.
 */
const POLL_MS = 2_000;

export const SEALED_DOWNLOAD_KEY = (shortCode: string): readonly [string, string] =>
  ['verify', shortCode] as const;

export function useSealedDownload(shortCode: string): UseQueryResult<VerifyResponse, Error> {
  return useQuery<VerifyResponse, Error>({
    queryKey: SEALED_DOWNLOAD_KEY(shortCode),
    queryFn: async ({ signal }) => {
      const res = await verifyApiClient.get<VerifyResponse>(
        `/verify/${encodeURIComponent(shortCode)}`,
        { signal },
      );
      return res.data;
    },
    enabled: shortCode.length > 0,
    // Refetch every 2 s ONLY while the envelope is still sealing — once
    // it's `completed` (or any terminal non-completed status) we have the
    // final answer and stop hammering the API.
    refetchInterval: (query) => {
      // Stop polling once we've surfaced an error — the page will offer
      // the /verify/<short_code> fallback link. Hammering through a hard
      // failure is just noise.
      if (query.state.status === 'error') return false;
      const data = query.state.data;
      if (!data) return POLL_MS;
      const status = data.envelope.status;
      if (status === 'completed' && data.sealed_url) return false;
      // Terminal-but-not-sealed statuses (declined / expired / canceled):
      // no sealed_url will ever appear; stop polling.
      if (status === 'declined' || status === 'expired' || status === 'canceled') {
        return false;
      }
      return POLL_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    // One quiet retry — sealing is async, occasional 5xx blips shouldn't
    // surface as a hard error to the signer.
    retry: 1,
  });
}
