import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiKeyListResponseSchema,
  CreateApiKeyResponseSchema,
  type ApiKey,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
} from 'shared';
import { apiClient } from '@/lib/api/apiClient';

export const API_KEYS_KEY = ['me', 'api-keys'] as const;

/** Lists the owner's live keys. A 404 (flag off or MCP_DISABLED) reads as `null`. */
async function fetchApiKeys(): Promise<ReadonlyArray<ApiKey> | null> {
  try {
    const res = await apiClient.get<unknown>('/me/api-keys');
    return ApiKeyListResponseSchema.parse(res.data).items;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** `null` data means the API says the feature is not available. */
export function useApiKeys() {
  return useQuery<ReadonlyArray<ApiKey> | null>({
    queryKey: API_KEYS_KEY,
    queryFn: fetchApiKeys,
  });
}

/**
 * `POST /me/api-keys`. An empty body is the one-tap create: the server picks
 * `Key N`, scope `envelopes:read` and a 90-day expiry.
 */
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation<CreateApiKeyResponse, Error, CreateApiKeyRequest>({
    mutationFn: async (body) => {
      const res = await apiClient.post<unknown>('/me/api-keys', body);
      return CreateApiKeyResponseSchema.parse(res.data);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient.post(`/me/api-keys/${encodeURIComponent(id)}/revoke`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}
