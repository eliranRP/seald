import { verifyApiClient } from '@/lib/api/verifyApiClient';

/**
 * `GET /verify/by-hash/:sha256` — the short_code of the envelope that sealed
 * a PDF with exactly this SHA-256. Rejects with an `ApiError` (`status` 404)
 * when no sealed document matches.
 */
export async function lookupShortCodeByHash(sha256: string, signal?: AbortSignal): Promise<string> {
  const res = await verifyApiClient.get<{ readonly short_code: string }>(
    `/verify/by-hash/${encodeURIComponent(sha256)}`,
    signal ? { signal } : undefined,
  );
  return res.data.short_code;
}
