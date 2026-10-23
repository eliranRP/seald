import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AutomationTestResultSchema,
  AutomationsListRunsOutputSchema,
  AutomationsRetryRunOutputSchema,
  OwnerAutomationListSchema,
  OwnerAutomationResponseSchema,
  OwnerAutomationSchema,
  RotateSecretResponseSchema,
  type AutomationTestResult,
  type CreateAutomationRequest,
  type OwnerAutomation,
  type OwnerAutomationList,
  type OwnerAutomationResponse,
  type RotateSecretResponse,
  type UpdateAutomationRequest,
} from 'shared';
import { apiClient } from '@/lib/api/apiClient';
import { errorStatus } from './model';

export const AUTOMATIONS_KEY = ['automations'] as const;
export const detailKey = (id: string) => [...AUTOMATIONS_KEY, id] as const;
export const runsKey = (id: string) => [...AUTOMATIONS_KEY, id, 'runs'] as const;
const path = (id: string) => `/automations/${encodeURIComponent(id)}`;

const RUNS_PAGE = 20;

/** A 404 (flag off, kill switch, or someone else's id) reads as `null`. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (errorStatus(err) === 404) return null;
    throw err;
  }
}

/** `null` data means the API says automations are not available. */
export function useAutomations() {
  return useQuery<OwnerAutomationList | null>({
    queryKey: AUTOMATIONS_KEY,
    queryFn: () =>
      orNull(async () => {
        const res = await apiClient.get<unknown>('/automations');
        return OwnerAutomationListSchema.parse(res.data);
      }),
  });
}

/** `null` data means no such automation for this owner. */
export function useAutomation(id: string) {
  return useQuery<OwnerAutomation | null>({
    queryKey: detailKey(id),
    queryFn: () =>
      orNull(async () => {
        const res = await apiClient.get<unknown>(path(id));
        return OwnerAutomationSchema.parse(res.data);
      }),
  });
}

/** Run history, newest first, 20 a page. */
export function useAutomationRuns(id: string) {
  return useInfiniteQuery({
    queryKey: runsKey(id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get<unknown>(`${path(id)}/runs`, {
        params: { limit: RUNS_PAGE, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return AutomationsListRunsOutputSchema.parse(res.data);
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** `POST /automations`. A webhook response carries the secret once. */
export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation<OwnerAutomationResponse, Error, CreateAutomationRequest>({
    mutationFn: async (body) => {
      const res = await apiClient.post<unknown>('/automations', body);
      return OwnerAutomationResponseSchema.parse(res.data);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
    },
  });
}

export interface UpdateVariables {
  readonly id: string;
  readonly body: UpdateAutomationRequest;
}

/** `PATCH /automations/:id`: the on/off switch and the edit form. */
export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation<OwnerAutomationResponse, Error, UpdateVariables>({
    mutationFn: async ({ id, body }) => {
      const res = await apiClient.patch<unknown>(path(id), body);
      return OwnerAutomationResponseSchema.parse(res.data);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
    },
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.delete(path(id));
    },
    onSuccess: async (_data, id) => {
      qc.removeQueries({ queryKey: detailKey(id) });
      await qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY, exact: true });
    },
  });
}

/** `POST /automations/:id/rotate-secret`. The new secret comes back once. */
export function useRotateSecret() {
  return useMutation<RotateSecretResponse, Error, string>({
    mutationFn: async (id) => {
      const res = await apiClient.post<unknown>(`${path(id)}/rotate-secret`);
      return RotateSecretResponseSchema.parse(res.data);
    },
  });
}

export interface RetryVariables {
  readonly id: string;
  readonly runId: string;
}

/** `POST /automations/:id/runs/:runId/retry`. Same run id, one tap. */
export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation<void, Error, RetryVariables>({
    mutationFn: async ({ id, runId }) => {
      const res = await apiClient.post<unknown>(
        `${path(id)}/runs/${encodeURIComponent(runId)}/retry`,
      );
      AutomationsRetryRunOutputSchema.parse(res.data);
    },
    onSuccess: async (_data, { id }) => {
      await qc.invalidateQueries({ queryKey: runsKey(id) });
      await qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
    },
  });
}

/** `POST /automations/:id/test`: one signed test event. Not stored as a run. */
export function useSendTest() {
  return useMutation<AutomationTestResult, Error, string>({
    mutationFn: async (id) => {
      const res = await apiClient.post<unknown>(`${path(id)}/test`);
      return AutomationTestResultSchema.parse(res.data);
    },
  });
}
