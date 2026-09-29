/**
 * Stable tag → palette mapping. Mirrors the design guide's `TAG_COLORS`
 * + `TAG_PALETTE` so a tag like "Legal" always renders indigo, "Sales"
 * emerald, "HR" pink, etc. New tags fall through to a hash-derived
 * slot in the palette so the colour stays stable across reloads.
 *
 * Slot order is part of the hash contract — do not reorder `TAG_PALETTE`.
 * Every slot is a different pair. The last slot is `info`, because
 * `success` is already slot 2.
 */

import { seald } from '@/styles/theme';

export interface TagColor {
  readonly bg: string;
  readonly fg: string;
}

const KNOWN: Record<string, TagColor> = {
  Legal: { bg: seald.color.indigo[50], fg: seald.color.indigo[700] },
  Sales: { bg: seald.color.success[50], fg: seald.color.success[700] },
  HR: { bg: seald.color.tag.pink[50], fg: seald.color.tag.pink[700] },
  Construction: { bg: seald.color.warn[50], fg: seald.color.warn[700] },
  Marketing: { bg: seald.color.tag.violet[50], fg: seald.color.tag.violet[700] },
};

export const TAG_PALETTE = [
  { bg: seald.color.indigo[50], fg: seald.color.indigo[700] },
  { bg: seald.color.success[50], fg: seald.color.success[700] },
  { bg: seald.color.tag.pink[50], fg: seald.color.tag.pink[700] },
  { bg: seald.color.warn[50], fg: seald.color.warn[700] },
  { bg: seald.color.tag.violet[50], fg: seald.color.tag.violet[700] },
  { bg: seald.color.tag.cyan[50], fg: seald.color.tag.cyan[700] },
  { bg: seald.color.danger[50], fg: seald.color.danger[700] },
  { bg: seald.color.info[50], fg: seald.color.info[700] },
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
 * otherwise hashes the tag name into `TAG_PALETTE` so colour
 * is stable across renders without a server-side colour assignment.
 */
export function tagColorFor(tag: string): TagColor {
  const known = KNOWN[tag];
  if (known) return known;
  const idx = hashStr(tag) % TAG_PALETTE.length;
  return TAG_PALETTE[idx] ?? TAG_PALETTE[0];
}
