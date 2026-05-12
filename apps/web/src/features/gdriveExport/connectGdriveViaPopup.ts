import { apiClient } from '@/lib/api/apiClient';
import {
  GDRIVE_OAUTH_BROADCAST_CHANNEL,
  GDRIVE_OAUTH_COMPLETE_MESSAGE,
} from '@/routes/settings/integrations/useGDriveAccounts';

const POPUP_FEATURES = 'width=480,height=720,menubar=no,toolbar=no,location=yes';

function isOAuthCompleteMessage(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === GDRIVE_OAUTH_COMPLETE_MESSAGE
  );
}

/**
 * Opens the Google OAuth consent popup and resolves once it signals
 * completion (`gdrive-oauth-complete` postMessage or BroadcastChannel —
 * the same belt-and-suspenders pair the settings page listens for) or
 * the popup is closed. Resolves `true` on a completion signal, `false`
 * if the popup closed without one (user canceled / blocked). The caller
 * should re-fetch the accounts / envelope to confirm a connection
 * actually landed.
 *
 * The consent URL is minted server-side (`GET /integrations/gdrive/oauth/url`,
 * PKCE state baked in) and the OAuth callback redirects the popup to the
 * bridge page which postMessages back here.
 */
export async function connectGdriveViaPopup(): Promise<boolean> {
  let url: string;
  try {
    const res = await apiClient.get<{ url: string }>('/integrations/gdrive/oauth/url');
    url = res.data.url;
  } catch {
    return false;
  }
  const popup = window.open(url, 'gdrive-oauth', POPUP_FEATURES);
  return new Promise<boolean>((resolve) => {
    let done = false;
    let channel: BroadcastChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = (): void => {
      window.removeEventListener('message', onMessage);
      channel?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
    const finish = (value: boolean): void => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };

    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!isOAuthCompleteMessage(event.data)) return;
      finish(true);
    }
    window.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(GDRIVE_OAUTH_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (isOAuthCompleteMessage(event.data)) finish(true);
      };
    }

    // Fallback: if the popup is closed without a completion signal,
    // resolve false. (Also covers popup-blocked → `popup` is null.)
    if (!popup) {
      finish(false);
      return;
    }
    pollTimer = setInterval(() => {
      if (popup.closed) finish(false);
    }, 500);
  });
}
