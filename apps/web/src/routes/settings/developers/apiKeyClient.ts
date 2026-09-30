import type { ApiKeyApprovalNotify, ApiKeyScope } from 'shared';
import { apiClient, type ApiError } from '@/lib/api/apiClient';
import type { CreateKeyInput, PatchKeyInput } from './types';

export interface ApiKeyResponse {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly require_owner_approval: boolean;
  readonly allow_new_recipients: boolean;
  readonly always_require_signin: boolean;
  readonly approval_notify: ApiKeyApprovalNotify;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
  readonly secret?: string;
}

export async function listApiKeys(): Promise<ApiKeyResponse[]> {
  const res = await apiClient.get<ApiKeyResponse[]>('/me/api-keys');
  return res.data;
}

export async function createApiKey(input: CreateKeyInput): Promise<ApiKeyResponse> {
  const res = await apiClient.post<ApiKeyResponse>('/me/api-keys', input);
  return res.data;
}

export async function patchApiKey(id: string, patch: PatchKeyInput): Promise<ApiKeyResponse> {
  const res = await apiClient.patch<ApiKeyResponse>(`/me/api-keys/${id}`, patch);
  return res.data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiClient.post(`/me/api-keys/${id}/revoke`, { revoked: true });
}

export function noticeForKeyError(err: unknown): string {
  const code = err instanceof Error ? ((err as ApiError).code ?? err.message) : '';
  if (code === 'key_limit') return 'You already have 10 keys.';
  if (code === 'name_taken') return 'That name is already in use.';
  if (code === 'fresh_login_required') return 'Sign in again to allow Send.';
  if (code === 'validation_error') return 'Check the key settings.';
  return 'Could not save the key.';
}
