import { useState } from 'react';
import { ENVELOPE_MACHINE } from 'shared';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { verifyApiClient } from '@/lib/api/verifyApiClient';
import type { VerifyResponse } from '@/features/verify';

/**
 * Polling helper for the post-sign Done page (and the "already signed"
 * link page) so a recipient can download the sealed PDF as soon as the API
 * finishes sealing.
 *
 * Why a dedicated hook (and not `useVerifyEnvelope`):
 *   - `useVerifyEnvelope` is a one-shot read with `retry: false` and a
 *     60 s `staleTime` for the public verify page; both are wrong here.
 *   - The Done page lands right after `POST /sign/submit`. If this signer
 *     was the last one the envelope is `sealing` and the seal worker
 *     finishes within seconds; if others still have to sign it stays
 *     `awaiting_others` for hours or days.
 *
 * Caching key matches `useVerifyEnvelope`'s so a later visit to
 * `/verify/:short_code` reuses the same cached data.
 *
 * The query is `enabled` only when a non-empty `shortCode` is provided —
 * undefined snapshots (deep-link to /done) skip the network entirely.
 */

/** While the seal worker is running (and briefly after the signer's own submit). */
export const SEALED_DOWNLOAD_FAST_POLL_MS = 2_000;
/** While other signers still have to sign: the wait is human-scale. */
export const SEALED_DOWNLOAD_SLOW_POLL_MS = 30_000;
/** How long after the signer's own submit an `awaiting_others` read still polls fast. */
export const SEALED_DOWNLOAD_POST_SUBMIT_FAST_MS = 20_000;

export const SEALED_DOWNLOAD_KEY = (shortCode: string): readonly [string, string] =>
  ['verify', shortCode] as const;

export interface SealedDownloadPollInput {
  readonly queryFailed: boolean;
  readonly data: VerifyResponse | undefined;
  /** `Date.now()` before which an `awaiting_others` envelope still polls fast. */
  readonly fastUntil: number;
  readonly now: number;
}

/**
 * The polling state machine, keyed on `ENVELOPE_MACHINE` (SM.1):
 *
 *   error                                  -> stop (the page offers /verify)
 *   no data yet                            -> fast
 *   download_sealed allowed (completed)    -> stop once sealed_url is known, else slow
 *   other terminal (declined/expired/...)  -> stop: no sealed_url will appear
 *   `sealed` can fire (sealing)            -> fast
 *   `all_signed` can fire (awaiting_others)-> fast inside the post-submit window, else slow
 *   anything else                          -> slow
 */
export function sealedDownloadPollInterval(input: SealedDownloadPollInput): number | false {
  if (input.queryFailed) return false;
  const { data } = input;
  if (!data) return SEALED_DOWNLOAD_FAST_POLL_MS;
  const status = data.envelope.status;
  if (ENVELOPE_MACHINE.allows(status, 'download_sealed')) {
    return data.sealed_url ? false : SEALED_DOWNLOAD_SLOW_POLL_MS;
  }
  if (ENVELOPE_MACHINE.isTerminal(status)) return false;
  if (ENVELOPE_MACHINE.can(status, 'sealed')) return SEALED_DOWNLOAD_FAST_POLL_MS;
  if (ENVELOPE_MACHINE.can(status, 'all_signed') && input.now < input.fastUntil) {
    return SEALED_DOWNLOAD_FAST_POLL_MS;
  }
  return SEALED_DOWNLOAD_SLOW_POLL_MS;
}

export interface UseSealedDownloadOptions {
  /** The page was reached by this signer's own submit: poll fast for a short window. */
  readonly justSubmitted?: boolean;
}

export function useSealedDownload(
  shortCode: string,
  options: UseSealedDownloadOptions = {},
): UseQueryResult<VerifyResponse, Error> {
  const { justSubmitted = false } = options;
  const [fastUntil] = useState(() =>
    justSubmitted ? Date.now() + SEALED_DOWNLOAD_POST_SUBMIT_FAST_MS : 0,
  );
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
    refetchInterval: (query) =>
      sealedDownloadPollInterval({
        queryFailed: query.state.status === 'error',
        data: query.state.data,
        fastUntil,
        now: Date.now(),
      }),
    refetchIntervalInBackground: false,
    staleTime: 0,
    // One quiet retry — sealing is async, occasional 5xx blips shouldn't
    // surface as a hard error to the signer.
    retry: 1,
  });
}
