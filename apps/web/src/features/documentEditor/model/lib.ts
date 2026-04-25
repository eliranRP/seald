import type { PlacePagesMode } from '@/components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';

// Default field box dimensions when the backend hasn't sent explicit width/
// height. The page is rendered at 560×740 base — these match the visual
// defaults from the design guide.
export const FIELD_WIDTH = 132;
export const FIELD_HEIGHT = 54;
// Pixels the pointer must travel before a mousedown on the canvas background
// is treated as a marquee-select drag rather than a plain click.
export const MARQUEE_THRESHOLD = 3;
// Pointer tolerance (px) for aligning a dragged field's edge/center with
// another field's edge/center. Small enough not to catch "accidental" snaps
// while still feeling magnetic when the user approaches alignment.
export const SNAP_THRESHOLD = 5;
// Pixel offset applied to pasted / keyboard-duplicated fields so they're not
// perfectly hidden behind the original.
export const PASTE_OFFSET = 16;
// Cap on the number of undo snapshots we retain — enough for several reverses
// while keeping memory bounded on long sessions.
export const UNDO_HISTORY_LIMIT = 50;
// Default rail widths and zoom range. 25% step matches Acrobat/Preview.
export const DEFAULT_LEFT_WIDTH = 240;
export const DEFAULT_RIGHT_WIDTH = 320;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

export function makeId(): string {
  // RFC-style compact id — good enough for DOM keys and internal refs.
  return `f_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function makeLinkId(): string {
  // Shared id assigned to every field in a single Place-on-pages action so
  // the Remove dialog can find and operate on all linked copies together.
  return `l_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

/**
 * Resolve the target pages for a duplicate-to-pages action. Skips the source
 * page so the caller can append new field clones without producing a duplicate
 * on the originating page.
 */
export function resolveTargetPages(
  mode: PlacePagesMode,
  sourcePage: number,
  totalPages: number,
  customPages?: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const all = Array.from({ length: totalPages }, (_v, i) => i + 1);
  switch (mode) {
    case 'this':
      return [];
    case 'all':
      return all.filter((p) => p !== sourcePage);
    case 'allButLast':
      return all.filter((p) => p !== sourcePage && p !== totalPages);
    case 'last':
      return totalPages === sourcePage ? [] : [totalPages];
    case 'custom':
      return (customPages ?? []).filter((p) => p !== sourcePage && p >= 1 && p <= totalPages);
    default:
      return [];
  }
}
