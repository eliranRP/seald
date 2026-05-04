import { useEffect, type ReactElement } from 'react';
import {
  GDRIVE_OAUTH_BROADCAST_CHANNEL,
  GDRIVE_OAUTH_COMPLETE_MESSAGE,
} from '@/routes/settings/integrations/useGDriveAccounts';

/**
 * Dedicated OAuth-callback bridge for the Google Drive popup. Mounted
 * at `/oauth/gdrive/callback` OUTSIDE `<AppShell />` so the AppShell
 * mobile-redirect rule (≤ 640 px → /m/send) does NOT fire — the popup
 * is opened at 480 × 720 px.
 *
 * Bug G (Phase 6.A iter-2 PROD, 2026-05-04): mounting the bridge
 * outside AppShell stopped the immediate /m/send redirect.
 *
 * Bug I (Phase 6.A iter-2 PROD, 2026-05-04): the api response carries
 * `Cross-Origin-Opener-Policy: same-origin` (helmet default). For a
 * cross-origin popup that header puts the popup in a fresh
 * browsing-context group and severs `window.opener` PERMANENTLY — even
 * after the popup later redirects back to the same-origin bridge route.
 * The bridge then saw opener=null, fell through to its same-tab
 * `<Navigate to="/settings/integrations">`, and AppShell's
 * mobile-redirect fired again on that mobile-sized viewport → /m/send.
 *
 * Two-pronged fix:
 *   1. The api now disables COOP (see apps/api/src/security-headers.ts)
 *      so `window.opener` survives the round-trip.
 *   2. We ALWAYS post on a same-origin `BroadcastChannel`, in addition
 *      to `opener.postMessage`, as belt-and-suspenders. BroadcastChannel
 *      works between same-origin tabs even when COOP severs the opener,
 *      so a future regression of (1) does not silently break the flow.
 *   3. The bridge NEVER navigates to /settings/integrations from inside
 *      the popup. It just renders a static "Drive connected" surface
 *      and calls `window.close()`. Even if the popup blocker collapsed
 *      the popup into the parent tab, the parent's listener
 *      (useGDriveOAuthMessageListener) picks up the BroadcastChannel
 *      message and refreshes the accounts list.
 */
export function GDriveOAuthCallbackPage(): ReactElement {
  useEffect(() => {
    const message = { type: GDRIVE_OAUTH_COMPLETE_MESSAGE } as const;

    // Belt: post to opener when the reference survived COOP.
    const opener = window.opener as Window | null;
    if (opener && opener !== window) {
      try {
        opener.postMessage(message, window.location.origin);
      } catch {
        // Same-origin postMessage shouldn't throw; if the parent
        // navigated away the call is a no-op. Fall through to the
        // BroadcastChannel + window.close() path below.
      }
    }

    // Suspenders: BroadcastChannel works between same-origin tabs
    // regardless of opener state. SSR-safe — guard for older browsers
    // / non-browser test envs that don't ship the constructor.
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(GDRIVE_OAUTH_BROADCAST_CHANNEL);
        channel.postMessage(message);
      } catch {
        // No-op: a partner on the parent tab will time out and the
        // user can close the popup manually.
      }
    }

    // Schedule close on a macrotask so the BroadcastChannel `postMessage`
    // has a chance to flush before the popup teardown nukes its event
    // loop. The static surface below renders during that window so the
    // user sees a confirmation rather than a blank page.
    const timer = setTimeout(() => {
      channel?.close();
      window.close();
    }, 0);

    return () => {
      clearTimeout(timer);
      channel?.close();
    };
  }, []);

  // Static surface — never <Navigate>. If the popup-blocker collapsed
  // the popup into the parent tab, the parent's BroadcastChannel
  // listener still picks up the signal; the user is left on a tiny
  // confirmation screen rather than getting bounced to /m/send by
  // AppShell's mobile-viewport guard.
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1f2937',
      }}
    >
      <p>Drive connected — you can close this window.</p>
    </div>
  );
}
