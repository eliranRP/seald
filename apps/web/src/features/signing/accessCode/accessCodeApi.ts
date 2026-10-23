import type { AxiosRequestConfig } from 'axios';
import type { AccessCodePurpose, AccessCodeSendResponse } from 'shared';
import { signApiClient } from '@/lib/api/signApiClient';

/** `POST /sign/access-code/verify` response: the session cookie is set, nothing secret is in the body. */
export interface AccessCodeVerifyResponse {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
}

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

/** Email a code. `access` uses the pending cookie; `action` needs the full session. */
export async function sendAccessCode(
  purpose: AccessCodePurpose,
  signal?: AbortSignal,
): Promise<AccessCodeSendResponse> {
  const { data } = await signApiClient.post<AccessCodeSendResponse>(
    '/sign/access-code/send',
    { purpose },
    configWithSignal(signal),
  );
  return data;
}

/** Check the code entered to open the document; on success the signer session starts. */
export async function verifyAccessCode(
  code: string,
  signal?: AbortSignal,
): Promise<AccessCodeVerifyResponse> {
  const { data } = await signApiClient.post<AccessCodeVerifyResponse>(
    '/sign/access-code/verify',
    { code },
    configWithSignal(signal),
  );
  return data;
}
