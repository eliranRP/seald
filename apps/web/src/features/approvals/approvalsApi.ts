import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  ApprovalCardSchema,
  ApprovalDetailSchema,
  ApprovalListResponseSchema,
  type ApprovalApproveBody,
  type ApprovalCard,
  type ApprovalDetail,
  type ApprovalListResponse,
  type ApprovalStatus,
} from 'shared';
import { apiClient, type ApiError } from '@/lib/api/apiClient';
import { approvalsPublicClient } from './approvalsPublicClient';

// ---------------------------------------------------------------------------
// Public page (`/approve#<token>`): preview and decide
// ---------------------------------------------------------------------------

/** Never decides. Returns the card and, for a pending link, the CSRF value. */
export async function previewApproval(token: string): Promise<ApprovalCard> {
  const res = await approvalsPublicClient.post<unknown>('/approvals/from-email/preview', {
    token,
  });
  return ApprovalCardSchema.parse(res.data);
}

export async function decideApproval(input: {
  readonly token: string;
  readonly decision: 'approve' | 'deny';
  readonly csrf: string;
}): Promise<ApprovalCard> {
  const res = await approvalsPublicClient.post<unknown>('/approvals/from-email', input);
  return ApprovalCardSchema.parse(res.data);
}

// ---------------------------------------------------------------------------
// Signed-in queue, card and review
// ---------------------------------------------------------------------------

export const approvalKeys = {
  all: ['approvals'] as const,
  list: (status: ApprovalStatus | 'all') => [...approvalKeys.all, 'list', status] as const,
  pendingCount: () => [...approvalKeys.all, 'pending-count'] as const,
  detail: (id: string) => [...approvalKeys.all, 'detail', id] as const,
};

const PAGE_SIZE = 20;

async function fetchList(
  status: ApprovalStatus | undefined,
  cursor: string | undefined,
  limit: number,
  signal?: AbortSignal,
): Promise<ApprovalListResponse> {
  const params: Record<string, string | number> = { limit };
  if (status) params.status = status;
  if (cursor) params.cursor = cursor;
  const res = await apiClient.get<unknown>('/approvals', {
    params,
    ...(signal ? { signal } : {}),
  });
  return ApprovalListResponseSchema.parse(res.data);
}

export function isNotFound(err: unknown): boolean {
  return (err as ApiError | null)?.status === 404;
}

/** The queue, newest first, a page at a time. */
export function useApprovalsQueue(status: ApprovalStatus | 'all') {
  return useInfiniteQuery<
    ApprovalListResponse,
    Error,
    InfiniteData<ApprovalListResponse>,
    ReturnType<typeof approvalKeys.list>,
    string | undefined
  >({
    queryKey: approvalKeys.list(status),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchList(status === 'all' ? undefined : status, pageParam, PAGE_SIZE, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

const BELL_POLL_MS = 60_000;

/**
 * Pending rows for the header bell. A 404 (flag off on the server) reads as
 * zero so a mismatched build never shows an error in the header.
 */
export function usePendingApprovalCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: approvalKeys.pendingCount(),
    enabled,
    refetchInterval: BELL_POLL_MS,
    queryFn: async ({ signal }) => {
      try {
        return (await fetchList('pending', undefined, 1, signal)).pending_count;
      } catch (err) {
        if (isNotFound(err)) return 0;
        throw err;
      }
    },
  });
}

export function useApprovalDetail(id: string) {
  return useQuery<ApprovalDetail>({
    queryKey: approvalKeys.detail(id),
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<unknown>(`/approvals/${encodeURIComponent(id)}`, { signal });
      return ApprovalDetailSchema.parse(res.data);
    },
    retry: false,
  });
}

export type ApprovalAction = 'approve' | 'deny' | 'refresh';

/**
 * `POST /approvals/:id/{approve,deny,refresh}`. Every result is the new
 * detail. `body` is the WP-45 Approve body (the typed account email, the
 * signer's consent and images). A `reveal` (a key minted on Approve) is in
 * the mutation result only: it is stripped before the detail is cached.
 */
export function useApprovalAction() {
  const qc = useQueryClient();
  return useMutation<
    ApprovalDetail,
    ApiError,
    {
      readonly id: string;
      readonly action: ApprovalAction;
      readonly body?: ApprovalApproveBody | undefined;
    }
  >({
    mutationFn: async ({ id, action, body }) => {
      const url = `/approvals/${encodeURIComponent(id)}/${action}`;
      const res = await (body === undefined
        ? apiClient.post<unknown>(url)
        : apiClient.post<unknown>(url, body));
      return ApprovalDetailSchema.parse(res.data);
    },
    onSuccess: async (detail) => {
      // Never cache a one-time secret: the cached detail outlives this page.
      const cached: ApprovalDetail = { ...detail };
      delete cached.reveal;
      qc.setQueryData(approvalKeys.detail(detail.id), cached);
      await qc.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}
