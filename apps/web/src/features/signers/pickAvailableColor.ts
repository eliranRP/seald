/**
 * Pick the first color from `palette` that is not already in `used`.
 *
 * Used for assigning a unique color to each signer in an envelope's
 * roster. The naive `prev.length % palette.length` pattern collides
 * after a mid-list removal — e.g. removing index 1 from
 * `[A(#0), B(#1), C(#2)]` and adding D gives D the same color as C.
 * Walking the palette and picking the lowest-index unused entry avoids
 * that without requiring callers to track a separate "next free slot"
 * counter.
 *
 * Comparisons are case-insensitive so `#abcdef` and `#ABCDEF` are
 * treated as the same color (both Tailwind's hex casing and our seed
 * fixtures are lower-case, but contact data sourced from elsewhere may
 * not be).
 *
 * When every palette slot is already taken, falls back to a
 * deterministic `used.length % palette.length` so two callers with the
 * same input produce the same output (predictable for tests).
 */
export function pickAvailableColor(
  palette: ReadonlyArray<string>,
  used: ReadonlyArray<string>,
): string {
  const usedSet = new Set(used.map((c) => c.toLowerCase()));
  const free = palette.find((c) => !usedSet.has(c.toLowerCase()));
  if (free !== undefined) return free;
  return palette[used.length % palette.length] ?? palette[0]!;
}
