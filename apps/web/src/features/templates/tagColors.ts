/**
 * Stable tag → palette mapping. Mirrors the design guide's `TAG_COLORS`
 * + `TAG_PALETTE` so a tag like "Legal" always renders indigo, "Sales"
 * emerald, "HR" pink, etc. New tags fall through to a hash-derived
 * slot in the palette so the colour stays stable across reloads.
 */

export interface TagColor {
  readonly bg: string;
  readonly fg: string;
}

const KNOWN: Record<string, TagColor> = {
  Legal: { bg: '#EEF2FF', fg: '#4338CA' },
  Sales: { bg: '#ECFDF5', fg: '#047857' },
  HR: { bg: '#FDF2F8', fg: '#BE185D' },
  Construction: { bg: '#FFFBEB', fg: '#B45309' },
  Marketing: { bg: '#F5F3FF', fg: '#6D28D9' },
};

const PALETTE: ReadonlyArray<TagColor> = [
  { bg: '#EEF2FF', fg: '#4338CA' }, // indigo
  { bg: '#ECFDF5', fg: '#047857' }, // emerald
  { bg: '#FDF2F8', fg: '#BE185D' }, // pink
  { bg: '#FFFBEB', fg: '#B45309' }, // amber
  { bg: '#F5F3FF', fg: '#6D28D9' }, // violet
  { bg: '#ECFEFF', fg: '#0E7490' }, // cyan
  { bg: '#FEF2F2', fg: '#B91C1C' }, // red
  { bg: '#F0FDF4', fg: '#166534' }, // green
];

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
  return PALETTE[idx]!;
}
