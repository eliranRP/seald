/**
 * queued/running show no status word. retrying shows "Retrying" and
 * "attempt n of m". succeeded shows "Done". failed shows "Failed" plus
 * Retry (retryable) or Fix (not retryable).
 */
export type RunStatus = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed';

export interface RunListItem {
  readonly id: string;
  readonly title: string;
  /** Already formatted for display, e.g. "Today, 14:02". */
  readonly when: string;
  readonly status: RunStatus;
  readonly attempt?: number | undefined;
  readonly maxAttempts?: number | undefined;
  /** One short reason for a failed run. */
  readonly reason?: string | undefined;
  readonly retryable?: boolean | undefined;
}

export interface RunListProps {
  readonly runs: readonly RunListItem[];
  readonly onRetry: (id: string) => void;
  readonly onFix: (id: string) => void;
  readonly hasMore?: boolean | undefined;
  readonly onLoadMore?: (() => void) | undefined;
  readonly emptyText?: string | undefined;
}
