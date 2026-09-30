import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiKey, listApiKeys, noticeForKeyError, revokeApiKey } from './apiKeyClient';
import type { CreateKeyInput } from './types';

export const API_KEYS_QUERY = ['me', 'api-keys'] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_QUERY,
    queryFn: listApiKeys,
  });
}

export function useApiKeyMutations(
  onCreated: (secret: string) => void,
  onError: (notice: string) => void,
  onRevoked: () => void,
) {
  const queryClient = useQueryClient();

  function settle(): void {
    void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY });
  }

  const create = useMutation({
    mutationFn: (input: CreateKeyInput) => createApiKey(input),
    onSuccess: (row) => {
      settle();
      if (row.secret) onCreated(row.secret);
    },
    onError: (err: unknown) => onError(noticeForKeyError(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      settle();
      onRevoked();
    },
    onError: (err: unknown) => onError(noticeForKeyError(err)),
  });

  return { create, revoke };
}
