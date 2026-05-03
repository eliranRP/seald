import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '@/lib/api/apiClient';
import { listDriveFiles, type DriveFilesResponse } from './driveFilesApi';
import type { DriveMimeFilter } from './DrivePicker.types';

/**
 * Stable query-key factory so consumers (manual invalidation, tests)
 * reference the exact tuple React-Query keys on.
 */
export function driveFilesKey(accountId: string, mimeFilter: DriveMimeFilter): readonly unknown[] {
  return ['gdrive', 'files', accountId, mimeFilter] as const;
}

export interface UseDriveFilesArgs {
  readonly accountId: string;
  readonly mimeFilter: DriveMimeFilter;
  /** Skip the fetch when the modal is closed (no work in the background). */
  readonly enabled: boolean;
}

export interface UseDriveFilesResult {
  readonly data: DriveFilesResponse | undefined;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly error: ApiError | null;
  /**
   * `true` once an HTTP 401 has surfaced (server's
   * `{ code: 'token-expired' }`). Components render the Reconnect CTA
   * in this case.
   */
  readonly tokenExpired: boolean;
  readonly refetch: () => void;
}

/**
 * Loads one page of Drive files for a given account + MIME filter.
 *
 * Pagination ("Load more") is intentionally a thin wrapper over
 * React-Query — the server doesn't expose a cursor in WT-A-2, so v1
 * lists the first 100 results. When the API gains a cursor (planned in
 * the post-WT-C iteration), `useDriveFiles` will switch to
 * `useInfiniteQuery` without changing the picker's render contract.
 *
 * Retry behaviour:
 *  - Network blips retry once.
 *  - HTTP 401 (`token-expired`) does NOT retry — the picker shows
 *    Reconnect immediately. A second probe would cost the user a
 *    second consent popup if the refresh-token is gone.
 */
export function useDriveFiles(args: UseDriveFilesArgs): UseDriveFilesResult {
  const { accountId, mimeFilter, enabled } = args;
  const query = useQuery<DriveFilesResponse, ApiError>({
    queryKey: driveFilesKey(accountId, mimeFilter),
    queryFn: ({ signal }) => listDriveFiles({ accountId, mimeFilter, signal }),
    enabled,
    retry: (failureCount, err) => {
      if (err.status === 401) return false;
      return failureCount < 1;
    },
    staleTime: 30_000,
  });

  const tokenExpired = query.error?.status === 401;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    tokenExpired,
    refetch: query.refetch,
  };
}

/**
 * Single-flight reconnect orchestrator.
 *
 * The token-expired Reconnect CTA must NEVER spawn more than one
 * consent popup per session. Multiple rapid clicks (or a re-render
 * loop) coalesce to one in-flight `Promise`; only when that resolves
 * does the next click open a fresh popup. The returned `reconnect`
 * is referentially stable across renders.
 */
export function useReconnectAccount(reconnectFn: () => Promise<void>): {
  readonly reconnect: () => Promise<void>;
  readonly inFlight: boolean;
} {
  // The ref carries the in-flight Promise across renders without
  // triggering a re-render itself. The boolean `inFlight` mirror lives
  // in `useState` so subscribers can render the spinner — they're kept
  // in sync inside `reconnect` (set true at start, false on settle).
  const inFlightRef = useRef<Promise<void> | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const reconnect = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    setInFlight(true);
    const p = reconnectFn().finally(() => {
      inFlightRef.current = null;
      setInFlight(false);
    });
    inFlightRef.current = p;
    return p;
  }, [reconnectFn]);

  return { reconnect, inFlight };
}
