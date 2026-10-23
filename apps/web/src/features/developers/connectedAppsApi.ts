import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectedAppListResponseSchema, type ConnectedApp } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

export const CONNECTED_APPS_KEY = ['me', 'connected-apps'] as const;

/** Lists the owner's connected apps. A 404 (OAuth dark) reads as `null`. */
async function fetchConnectedApps(): Promise<ReadonlyArray<ConnectedApp> | null> {
  try {
    const res = await apiClient.get<unknown>('/me/connected-apps');
    return ConnectedAppListResponseSchema.parse(res.data).items;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export function useConnectedApps(enabled: boolean) {
  return useQuery<ReadonlyArray<ConnectedApp> | null>({
    queryKey: CONNECTED_APPS_KEY,
    queryFn: fetchConnectedApps,
    enabled,
  });
}

export function useRevokeConnectedApp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.post(`/me/connected-apps/${encodeURIComponent(id)}/revoke`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CONNECTED_APPS_KEY });
    },
  });
}
