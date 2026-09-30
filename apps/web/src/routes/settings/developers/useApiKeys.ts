import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createApiKey,
  listApiKeys,
  noticeForKeyError,
  patchApiKey,
  revokeApiKey,
} from './apiKeyClient';
import type { CreateKeyInput, PatchKeyInput } from './types';

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

  const patch = useMutation({
    mutationFn: (args: { id: string; patch: PatchKeyInput }) => patchApiKey(args.id, args.patch),
    onSuccess: settle,
    onError: (err: unknown) => onError(noticeForKeyError(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: settle,
    onError: (err: unknown) => onError(noticeForKeyError(err)),
  });

  return { create, patch, revoke };
}
