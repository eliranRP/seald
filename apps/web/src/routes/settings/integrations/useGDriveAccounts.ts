import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api/apiClient';

/**
 * View model for a connected Google Drive account, mirroring the API
 * `GDriveAccountView` shape from `apps/api/src/integrations/gdrive/dto/account.dto.ts`.
 * Refresh tokens / KMS metadata never cross the wire — the backend
 * scrubs them before serializing.
 */
export interface GDriveAccount {
  readonly id: string;
  readonly email: string;
  readonly connectedAt: string;
  readonly lastUsedAt: string | null;
}

export const GDRIVE_ACCOUNTS_KEY = ['integrations', 'gdrive', 'accounts'] as const;

const POPUP_FEATURES = 'width=480,height=720,menubar=no,toolbar=no,location=yes';

/**
 * Lists every Google Drive account connected by the current user. When
 * the `feature.gdriveIntegration` flag is OFF the API replies 404 — we
 * map that to an empty list so the page renders the empty state cleanly
 * (rather than crashing with an error boundary on an unreleased route).
 */
export function useGDriveAccounts() {
  return useQuery<ReadonlyArray<GDriveAccount>>({
    queryKey: GDRIVE_ACCOUNTS_KEY,
    queryFn: async () => {
      try {
        const res = await apiClient.get<ReadonlyArray<GDriveAccount>>(
          '/integrations/gdrive/accounts',
        );
        return res.data;
      } catch (err) {
        if ((err as ApiError)?.status === 404) {
          return [];
        }
        throw err;
      }
    },
    retry: 1,
    staleTime: 30_000,
  });
}

/**
 * Kicks off the Google OAuth consent flow. We request a one-shot consent
 * URL from the API (PKCE state nonce baked in by WT-A), then open it in
 * a sized popup so the user keeps the integrations page in their main
 * tab. The OAuth callback redirects the popup back to
 * `/settings/integrations?connected=1`, at which point the page
 * invalidates the accounts query and shows the connected row.
 */
export function useConnectGDrive() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await apiClient.get<{ url: string }>('/integrations/gdrive/oauth/url');
      // window.open is null in some test envs; we still complete the
      // mutation so the caller can show a confirmation toast.
      window.open(res.data.url, 'gdrive-oauth', POPUP_FEATURES);
    },
  });
}

/**
 * Soft-deletes a connected account at the API. The backend revokes the
 * refresh token at Google before flipping the row's `deleted_at` so a
 * compromised token can't outlive the disconnect click.
 */
export function useDisconnectGDrive() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (accountId) => {
      await apiClient.delete(`/integrations/gdrive/accounts/${accountId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GDRIVE_ACCOUNTS_KEY });
    },
  });
}
