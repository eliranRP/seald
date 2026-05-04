import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api/apiClient';

/**
 * Postmessage envelope sent by the OAuth-callback popup back to its
 * opener (the SPA tab that triggered the connect click). Same-origin
 * only — the listener cross-checks `event.origin` against the SPA's
 * own origin so a foreign tab cannot poke the parent into refetching.
 */
export const GDRIVE_OAUTH_COMPLETE_MESSAGE = 'gdrive-oauth-complete' as const;
type GdriveOAuthCompleteMessage = { readonly type: typeof GDRIVE_OAUTH_COMPLETE_MESSAGE };

/**
 * Same-origin BroadcastChannel name used as a belt-and-suspenders
 * fallback alongside `window.opener.postMessage`. The api currently
 * sends `Cross-Origin-Opener-Policy: same-origin` — and Chrome 120+
 * is rolling out stricter COOP defaults — so opener references can be
 * severed at any time. BroadcastChannel works between any same-origin
 * tabs regardless of opener state, so the parent receives the
 * connect signal even when COOP nukes the postMessage path.
 * Bug I (Phase 6.A iter-2 PROD, 2026-05-04).
 */
export const GDRIVE_OAUTH_BROADCAST_CHANNEL = 'seald-gdrive-oauth' as const;

function isOAuthCompleteMessage(data: unknown): data is GdriveOAuthCompleteMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === GDRIVE_OAUTH_COMPLETE_MESSAGE
  );
}

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
 * Bridge effect for the OAuth-callback popup landing page. The API
 * redirects the popup to `/settings/integrations?connected=1` after a
 * successful token exchange. This hook detects that landing and either:
 *   - Popup mode: postMessage `gdrive-oauth-complete` back to the
 *     opener (same-origin SPA tab) so the parent invalidates its
 *     accounts query, then `window.close()` the popup.
 *   - Same-tab fallback (no opener — popup-blocker collapsed it into
 *     the parent tab): invalidate the accounts query inline.
 *
 * Returns a flag the page can use to render a tiny "Closing…" surface
 * so the popup doesn't briefly flash the full integrations UI before
 * dying. Bug F (Phase 6.A iter-2 PROD, 2026-05-04).
 */
export function useGDriveOAuthCallbackBridge(isCallbackReturn: boolean): boolean {
  const qc = useQueryClient();
  const opener = typeof window !== 'undefined' ? window.opener : null;
  const isPopupBridge = isCallbackReturn && Boolean(opener) && opener !== window;
  useEffect(() => {
    if (!isCallbackReturn) return;
    if (opener && opener !== window) {
      try {
        (opener as Window).postMessage(
          { type: GDRIVE_OAUTH_COMPLETE_MESSAGE },
          window.location.origin,
        );
      } catch {
        // postMessage on a same-origin opener should not throw, but if
        // the parent has navigated away the call is a no-op — fall
        // through to window.close() so the popup still goes away.
      }
      window.close();
      return;
    }
    // Same-tab fallback: popup blocker collapsed the popup into the
    // parent tab, so we land on /settings/integrations?connected=1
    // inline. We can't rely on window.postMessage-to-self in every
    // environment (jsdom test runner drops the origin), so invalidate
    // the accounts query directly. Defer with a macrotask
    // (setTimeout 0) so the initial fetch from useGDriveAccounts has
    // settled before the invalidate fires — invalidate during an
    // in-flight fetch is deduped, leaving the empty list visible.
    const timer = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: GDRIVE_ACCOUNTS_KEY });
    }, 0);
    return () => clearTimeout(timer);
  }, [isCallbackReturn, opener, qc]);
  return isPopupBridge;
}

/**
 * Companion listener for the parent SPA tab. Subscribes to `message`
 * events and, when a same-origin `gdrive-oauth-complete` arrives,
 * invalidates the accounts query so the connected row appears without
 * a reload. Pairs with `useGDriveOAuthCallbackBridge` running inside
 * the popup.
 */
export function useGDriveOAuthMessageListener(): void {
  const qc = useQueryClient();
  useEffect(() => {
    function invalidate(): void {
      void qc.invalidateQueries({ queryKey: GDRIVE_ACCOUNTS_KEY });
    }
    function postMessageHandler(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!isOAuthCompleteMessage(event.data)) return;
      invalidate();
    }
    window.addEventListener('message', postMessageHandler);

    // Belt-and-suspenders: BroadcastChannel works between same-origin
    // tabs even when COOP severs `window.opener`. SSR-safe — guard on
    // typeof for older browsers / non-browser environments.
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(GDRIVE_OAUTH_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (!isOAuthCompleteMessage(event.data)) return;
        invalidate();
      };
    }

    return () => {
      window.removeEventListener('message', postMessageHandler);
      channel?.close();
    };
  }, [qc]);
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
