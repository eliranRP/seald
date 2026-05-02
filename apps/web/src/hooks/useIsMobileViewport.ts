import { useEffect, useState } from 'react';

/**
 * Tracks whether the current viewport is "mobile-sized" (≤ 640 px wide).
 * SSR-safe: returns `false` on the server / first paint, then updates on
 * mount once `window.matchMedia` is available. Listens for media-query
 * changes so the value updates live (e.g. orientation flips).
 */
export const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)';

function readMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const handle = (e: MediaQueryListEvent | MediaQueryList): void => {
      setIsMobile(e.matches);
    };
    // Seed with the live value (matchMedia stub in tests can return false,
    // a real browser will return whatever matches at mount time).
    setIsMobile(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handle);
      return () => mql.removeEventListener('change', handle);
    }
    // Safari < 14 fallback.
    mql.addListener(handle);
    return () => mql.removeListener(handle);
  }, []);

  return isMobile;
}

/**
 * Synchronous read — useful in routing/redirect decisions where we don't want
 * a paint flash. Equivalent to the hook's first effect-driven update but
 * available outside of React. Returns `false` on the server.
 */
export function readIsMobileViewport(): boolean {
  return readMatch();
}
