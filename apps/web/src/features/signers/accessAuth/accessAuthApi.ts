import type { AxiosRequestConfig } from 'axios';
import type { AccessAuthSettings, PatchAccessAuthRequest } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

/** `PATCH /envelopes/:id/access-auth` (draft only, flag `signerAccessAuth`). */
export async function patchEnvelopeAccessAuth(
  envelopeId: string,
  body: PatchAccessAuthRequest,
  signal?: AbortSignal,
): Promise<AccessAuthSettings> {
  const { data } = await apiClient.patch<AccessAuthSettings>(
    `/envelopes/${envelopeId}/access-auth`,
    body,
    configWithSignal(signal),
  );
  return data;
}
