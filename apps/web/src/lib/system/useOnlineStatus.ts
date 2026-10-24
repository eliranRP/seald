import { useEffect, useRef, useState } from 'react';

/**
 * offline      the browser reports no network
 * reconnecting the browser says it is back, the API health check is pending
 * back         the API answered; shown for BACK_ONLINE_MS, then idle
 * idle         nothing to say
 */
export type OnlinePhase = 'idle' | 'offline' | 'reconnecting' | 'back';

export const BACK_ONLINE_MS = 2000;
export const RECHECK_MS = 3000;

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/** Cheap, unauthenticated readiness ping (`GET /health`). */
export async function pingHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface OnlineStatus {
  readonly phase: OnlinePhase;
  /** True while the network is down or not yet confirmed (disable network actions). */
  readonly offline: boolean;
}

/**
 * `navigator.onLine` plus the window `online` / `offline` events. On `online`
 * the API health endpoint is pinged before "Back online" is declared, and
 * retried every few seconds while it keeps failing. All timers are cleared on
 * unmount.
 */
export function useOnlineStatus(): OnlineStatus {
  const [phase, setPhase] = useState<OnlinePhase>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
  );
  const timer = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const clear = (): void => {
      window.clearTimeout(timer.current);
      abort.current?.abort();
      abort.current = null;
    };

    const check = (): void => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      void pingHealth(ctl.signal).then((ok) => {
        if (ctl.signal.aborted) return;
        if (ok) {
          setPhase('back');
          timer.current = window.setTimeout(() => {
            setPhase('idle');
          }, BACK_ONLINE_MS);
        } else {
          timer.current = window.setTimeout(check, RECHECK_MS);
        }
      });
    };

    const onOffline = (): void => {
      clear();
      setPhase('offline');
    };
    const onOnline = (): void => {
      clear();
      setPhase('reconnecting');
      check();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clear();
    };
  }, []);

  return { phase, offline: phase === 'offline' || phase === 'reconnecting' };
}
