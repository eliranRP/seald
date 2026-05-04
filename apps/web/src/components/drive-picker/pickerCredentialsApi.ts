import { apiClient } from '@/lib/api/apiClient';

/**
 * Wire shape of `GET /integrations/gdrive/picker-credentials`.
 *
 * Vended by the API so the SPA can construct
 * `google.picker.PickerBuilder` without the developer key + app id ever
 * being baked into the JS bundle. The returned `accessToken` is a
 * short-lived OAuth access token scoped to `drive.file` — never the
 * refresh token.
 *
 * Server returns:
 *   - 200 with credentials when a connected account exists,
 *   - 401 (`reconnect_required`) when the refresh token is gone,
 *   - 503 when `GDRIVE_PICKER_DEVELOPER_KEY` / `GDRIVE_PICKER_APP_ID`
 *     are not configured on the server.
 */
export interface PickerCredentials {
  readonly accessToken: string;
  readonly developerKey: string;
  readonly appId: string;
}

export async function fetchPickerCredentials(accountId: string): Promise<PickerCredentials> {
  const { data } = await apiClient.get<PickerCredentials>(
    '/integrations/gdrive/picker-credentials',
    { params: { accountId } },
  );
  return data;
}
