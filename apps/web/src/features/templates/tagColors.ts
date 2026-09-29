/**
 * Stable tag → palette mapping. Mirrors the design guide's `TAG_COLORS`
 * + `TAG_PALETTE` so a tag like "Legal" always renders indigo, "Sales"
 * emerald, "HR" pink, etc. New tags fall through to a hash-derived
 * slot in the palette so the colour stays stable across reloads.
 *
 * Slot order is part of the hash contract — do not reorder `PALETTE`.
 */

import { seald } from '@/styles/theme';

export interface TagColor {
  readonly bg: string;
  readonly fg: string;
}

const KNOWN: Record<string, TagColor> = {
  Legal: { bg: seald.color.indigo[50], fg: seald.color.indigo[700] },
  Sales: { bg: seald.color.success[50], fg: seald.color.success[700] },
  HR: { bg: seald.color.pink[50], fg: seald.color.pink[700] },
  Construction: { bg: seald.color.warn[50], fg: seald.color.warn[700] },
  Marketing: { bg: seald.color.violet[50], fg: seald.color.violet[700] },
};

const PALETTE = [
  { bg: seald.color.indigo[50], fg: seald.color.indigo[700] },
  { bg: seald.color.success[50], fg: seald.color.success[700] },
  { bg: seald.color.pink[50], fg: seald.color.pink[700] },
  { bg: seald.color.warn[50], fg: seald.color.warn[700] },
  { bg: seald.color.violet[50], fg: seald.color.violet[700] },
  { bg: seald.color.cyan[50], fg: seald.color.cyan[700] },
  { bg: seald.color.danger[50], fg: seald.color.danger[700] },
  { bg: seald.color.green[50], fg: seald.color.green[700] },
] as const satisfies readonly TagColor[];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Resolve a tag's display palette. Pure: same input → same output.
 * Returns the curated palette slot when the tag is in `KNOWN`,
 * otherwise hashes the tag name into the open `PALETTE` so colour
 * is stable across renders without a server-side colour assignment.
 */
export function tagColorFor(tag: string): TagColor {
  const known = KNOWN[tag];
  if (known) return known;
  const idx = hashStr(tag) % PALETTE.length;
  return PALETTE[idx] ?? PALETTE[0];
}
