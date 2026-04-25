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
    // Don't retry — verify is a public read-only surface; 404 means the
    // short_code is wrong (won't fix on retry) and 5xx is rare enough
    // that a manual page refresh is fine. Skipping retries also keeps
    // the loading UI snappy and predictable.
    retry: false,
  });
}
