import { useEffect, useRef, useState } from 'react';

/**
 * Holds a boolean flag (typically a `loading` state) "true" for at least
 * `minMs` milliseconds, even if the real flag flips back to false sooner.
 *
 * The motivation: when a cached query resolves in <50 ms the skeleton flashes
 * on screen for one frame — that's more distracting than useful. Forcing a
 * minimum visible duration keeps the UI calmer without slowing down the
 * actual data flow (the request is still sent / completed at the real
 * time; only the *visual* loading indicator is extended).
 *
 * The returned flag only ever *delays* the `true → false` transition — a
 * `false → true` transition is applied immediately so a fresh fetch shows
 * the skeleton without waiting on any previous timer.
 */
export function useMinDuration(flag: boolean, minMs = 2000): boolean {
  const [held, setHeld] = useState<boolean>(flag);
  const startedAt = useRef<number | null>(flag ? Date.now() : null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flag) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startedAt.current = Date.now();
      setHeld(true);
      return;
    }

    // flag just went false — decide whether to drop immediately or hold.
    const elapsed = startedAt.current ? Date.now() - startedAt.current : minMs;
    const remaining = Math.max(0, minMs - elapsed);
    if (remaining === 0) {
      setHeld(false);
      startedAt.current = null;
      return;
    }
    timerRef.current = setTimeout(() => {
      setHeld(false);
      startedAt.current = null;
      timerRef.current = null;
    }, remaining);
    // eslint-disable-next-line consistent-return -- the timer clearout is a cleanup for the branch below
  }, [flag, minMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return held;
}
