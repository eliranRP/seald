import { useCallback } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SessionExpiredDialog } from '@/components/SessionExpiredDialog';
import { Toast } from '@/components/Toast';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { clearSessionExpired, dismissNotice, useSystemState } from '@/lib/system/systemStore';
import { useAuth } from '@/providers/AuthProvider';
import { pathWithNext, validateReturnPath } from './nextPath';

/**
 * Global system UI mounted once in the app shell: the "You were signed out"
 * dialog (the page stays mounted behind it) and the queued system toast
 * (rate limit, upload failed). Both are fed by `lib/system/systemStore`.
 *
 * Sign in again signs out locally, so the stale session no longer bounces
 * `/signin` back to the dashboard, then goes to `/signin?next=<this page>`;
 * the auth flow returns to `next` (same-app paths only, see `nextPath`).
 */
export function SystemOverlays(): JSX.Element {
  const { sessionExpired, notices } = useSystemState();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useIsMobileViewport();

  const signInAgain = useCallback((): void => {
    const here = validateReturnPath(`${location.pathname}${location.search}`);
    void signOut()
      .catch(() => undefined)
      .finally(() => {
        clearSessionExpired();
        navigate(pathWithNext('/signin', here), { replace: true });
      });
  }, [location.pathname, location.search, navigate, signOut]);

  // One toast at a time: the newest wins.
  const notice = notices[notices.length - 1];

  return (
    <>
      <SessionExpiredDialog
        open={sessionExpired && user !== null}
        mobile={mobile}
        onSignIn={signInAgain}
      />
      {notice ? (
        <Toast
          key={notice.id}
          title={notice.title}
          tone={notice.tone}
          icon={notice.icon}
          subtitle={notice.subtitle}
          duration={notice.duration}
          onClose={() => {
            dismissNotice(notice.id);
          }}
          action={
            notice.action
              ? {
                  label: notice.action.label,
                  onClick: () => {
                    dismissNotice(notice.id);
                    notice.action?.onClick();
                  },
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
