import { useCallback, useEffect, useRef } from 'react';

/**
 * Trailing-edge debounce for a callback.
 *
 * Returns a stable function reference that, when called, schedules `fn`
 * to fire `delayMs` later — unless it's called again first, in which
 * case the timer resets and only the latest invocation eventually
 * fires. Used to coalesce noisy event streams (e.g. one keystroke per
 * character) into a single trailing call (one save after the user
 * stops typing).
 *
 * Why a ref-on-fn instead of binding `fn` into deps:
 *   - The returned function's identity stays stable across renders, so
 *     consumers can put it in their own effect/callback dependency
 *     arrays without re-creating the debounce on every render.
 *   - We always call the LATEST `fn` (refreshed each render) — avoids
 *     the classic stale-closure bug where the debounced call captures
 *     a render-frozen `fn` and uses outdated state.
 *
 * Cancels any pending call on unmount so a save can't fire against an
 * unmounted page.
 */
export function useDebouncedCallback<TArgs extends ReadonlyArray<unknown>>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
