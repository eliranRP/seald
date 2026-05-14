import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { verifyApiClient } from '@/lib/api/verifyApiClient';
import type { VerifyResponse } from './types';

export const VERIFY_KEY = (shortCode: string): readonly [string, string] =>
  ['verify', shortCode] as const;

/**
 * Fetches the public verify payload for a short_code. No auth headers; the
 * route is public by design (counterpart to the QR code on the audit PDF).
 *
 * Cached for 60s — verify is read-only and the upstream payload only changes
 * when an envelope transitions state, which is rare relative to refresh
 * cadence. A short stale window keeps the page snappy when a user paginates
 * away and back.
 */
export function useVerifyEnvelope(shortCode: string): UseQueryResult<VerifyResponse, Error> {
  return useQuery<VerifyResponse, Error>({
    queryKey: VERIFY_KEY(shortCode),
    queryFn: async ({ signal }) => {
      const res = await verifyApiClient.get<VerifyResponse>(
        `/verify/${encodeURIComponent(shortCode)}`,
        { signal },
      );
      return res.data;
    },
    enabled: shortCode.length > 0,
    staleTime: 60_000,
    // Verify is a public read-only surface. Skip retries on terminal HTTP
    // status (404 = wrong code, 4xx = bad request) — those won't fix on
    // retry and just delay the error UI. Retry once on transient network
    // errors (no `status` field on the thrown error) so brief connectivity
    // blips don't dump the user into the error panel; manual <Retry/> in
    // VerifyLoading handles the long-tail case after 15s.
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      const status = (error as { status?: unknown }).status;
      // Treat any non-numeric `status` (or its absence) as a network error
      // worth one retry. HTTP responses always carry a numeric status.
      return typeof status !== 'number';
    },
    // No exponential backoff — verify is a single read with one retry on
    // network blips. The default 1s delay would otherwise stall the error
    // UI for a full second when the API truly is unreachable.
    retryDelay: 0,
  });
}
