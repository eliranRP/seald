import { useEffect, type ReactElement } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { GDRIVE_OAUTH_COMPLETE_MESSAGE } from '@/routes/settings/integrations/useGDriveAccounts';

/**
 * Dedicated OAuth-callback bridge for the Google Drive popup. Mounted
 * at `/oauth/gdrive/callback` OUTSIDE `<AppShell />` so the AppShell
 * mobile-redirect rule (≤ 640 px → /m/send) does NOT fire — the popup
 * is opened at 480 × 720 px and was getting redirected before the
 * postMessage + close effect could run. Bug G (Phase 6.A iter-2 PROD,
 * 2026-05-04). The canonical OAuth-popup pattern: dedicated callback
 * route, postMessage to opener (same-origin), then window.close().
 *
 * Same-tab fallback (popup blocker collapsed the popup into the parent
 * tab → no opener): redirect to /settings/integrations?connected=1 so
 * the integrations page picks up the connected query param and
 * invalidates the accounts query (handled by the existing bridge in
 * useGDriveAccounts.ts).
 */
export function GDriveOAuthCallbackPage(): ReactElement {
  const [params] = useSearchParams();
  const opener = typeof window !== 'undefined' ? window.opener : null;
  const isPopup = Boolean(opener) && opener !== window;

  useEffect(() => {
    if (!isPopup) return;
    try {
      (opener as Window).postMessage(
        { type: GDRIVE_OAUTH_COMPLETE_MESSAGE },
        window.location.origin,
      );
    } catch {
      // Same-origin postMessage shouldn't throw; if the parent
      // navigated away the call is a no-op. Either way, fall through
      // to window.close() so the popup goes away.
    }
    window.close();
  }, [isPopup, opener]);

  if (!isPopup) {
    const connected = params.get('connected');
    const target = connected
      ? `/settings/integrations?connected=${encodeURIComponent(connected)}`
      : '/settings/integrations';
    return <Navigate to={target} replace />;
  }

  // Tiny surface so the popup doesn't flash blank between landing and
  // window.close(). Inline styles to avoid pulling in the styled
  // components weight for a sub-second render.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1f2937',
      }}
    >
      <p>Connecting Drive…</p>
    </div>
  );
}
