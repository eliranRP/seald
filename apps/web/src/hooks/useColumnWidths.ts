import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Column-width state with `localStorage` persistence — used by the
 * dashboard table to keep each user's resized layout across sessions.
 *
 * The hook is generic over the column key set: callers pass an array
 * of `{ key, default, min }` specs; the returned `widths` map is keyed
 * by the same strings. Missing or malformed storage values silently
 * fall back to each spec's default, so a corrupted `localStorage` row
 * never breaks the table.
 *
 * Writes are batched via `requestAnimationFrame` so a 60 fps drag
 * coalesces to one write per frame instead of one per pointermove.
 */

export interface ColumnSpec {
  readonly key: string;
  /** Default width in pixels. */
  readonly default: number;
  /** Lower bound enforced at write time. Default 80 px. */
  readonly min?: number;
}

export interface ColumnWidthsResult {
  readonly widths: Readonly<Record<string, number>>;
  readonly setWidth: (key: string, px: number) => void;
  readonly resetAll: () => void;
}

const DEFAULT_MIN_PX = 80;

function readFromStorage(storageKey: string): Record<string, number> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function writeToStorage(storageKey: string, value: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Disabled storage (Safari private mode), quota exceeded, etc. —
    // silently no-op. The user keeps their drag for the session.
  }
}

export function useColumnWidths(
  specs: ReadonlyArray<ColumnSpec>,
  storageKey: string,
): ColumnWidthsResult {
  const minByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of specs) m.set(s.key, s.min ?? DEFAULT_MIN_PX);
    return m;
  }, [specs]);

  const initial = useMemo(() => {
    const stored = readFromStorage(storageKey) ?? {};
    const out: Record<string, number> = {};
    for (const s of specs) {
      const stashed = stored[s.key];
      out[s.key] =
        typeof stashed === 'number' && stashed >= (s.min ?? DEFAULT_MIN_PX) ? stashed : s.default;
    }
    return out;
    // We deliberately ignore subsequent spec changes — the hook
    // assumes the spec list is stable across renders. Reading on
    // mount only is the canonical persisted-preferences pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const [widths, setWidths] = useState<Record<string, number>>(initial);

  // Coalesce burst pointer-move updates into one rAF tick so a 60 fps
  // drag writes once per frame, not per pixel.
  const pendingRef = useRef<Record<string, number> | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (pendingRef.current === null) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    rafRef.current = null;
    setWidths(next);
    writeToStorage(storageKey, next);
  }, [storageKey]);

  const setWidth = useCallback(
    (key: string, px: number) => {
      const min = minByKey.get(key) ?? DEFAULT_MIN_PX;
      const clamped = Math.max(min, Math.round(px));
      pendingRef.current = { ...(pendingRef.current ?? widths), [key]: clamped };
      if (rafRef.current === null) {
        rafRef.current =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(flush)
            : (setTimeout(flush, 0) as unknown as number);
      }
    },
    [flush, minByKey, widths],
  );

  const resetAll = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
      else clearTimeout(rafRef.current);
      rafRef.current = null;
    }
    const reset: Record<string, number> = {};
    for (const s of specs) reset[s.key] = s.default;
    setWidths(reset);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [specs, storageKey]);

  // Cancel any pending rAF on unmount so we don't fire `setWidths`
  // against a torn-down component.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
        else clearTimeout(rafRef.current);
      }
    };
  }, []);

  return { widths, setWidth, resetAll };
}
