import type { PlacePagesMode } from '@/components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

// Default field box dimensions when the backend hasn't sent explicit width/
// height. The page is rendered at 560×740 base — these match the visual
// defaults from the design guide.
export const FIELD_WIDTH = 132;
export const FIELD_HEIGHT = 54;

/** Per-kind default dimensions. Falls back to FIELD_WIDTH/FIELD_HEIGHT. */
export const FIELD_SIZE: Record<string, { readonly w: number; readonly h: number }> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 28, h: 28 },
};
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

export function makeGroupId(): string {
  // Persistent group id — assigned by the "Group" toolbar action so a set
  // of fields can be selected/dragged/duplicated as one. Distinct prefix
  // from linkId (`l_`) and field id (`f_`) so logs are easy to scan.
  return `g_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

/**
 * Expand a selection so that every member of any persistent group represented
 * in the input is included. If field A is in `selectedIds` and has
 * `groupId === 'g1'`, every other field with `groupId === 'g1'` is added to
 * the result. Idempotent: re-applying does not change the output.
 *
 * Returns the input untouched (same reference is fine but not guaranteed)
 * when no selected field carries a `groupId`, so callers don't need to
 * branch on the empty-group case.
 */
export function expandSelectionToGroup(
  selectedIds: ReadonlyArray<string>,
  fields: ReadonlyArray<PlacedFieldValue>,
): ReadonlyArray<string> {
  if (selectedIds.length === 0) return selectedIds;
  const groups = new Set<string>();
  const fieldById = new Map<string, PlacedFieldValue>();
  for (const f of fields) fieldById.set(f.id, f);
  for (const id of selectedIds) {
    const f = fieldById.get(id);
    if (f?.groupId) groups.add(f.groupId);
  }
  if (groups.size === 0) return selectedIds;
  const out = new Set<string>(selectedIds);
  for (const f of fields) {
    if (f.groupId && groups.has(f.groupId)) out.add(f.id);
  }
  return Array.from(out);
}

/**
 * Returns true when the selection forms one and only one complete group:
 * 2+ fields, every selected field has the same `groupId`, and that
 * `groupId` is non-empty. Used to enable/disable the Group / Ungroup
 * toolbar buttons.
 */
export function isFullyGrouped(
  selectedIds: ReadonlyArray<string>,
  fields: ReadonlyArray<PlacedFieldValue>,
): boolean {
  if (selectedIds.length < 2) return false;
  const fieldById = new Map<string, PlacedFieldValue>();
  for (const f of fields) fieldById.set(f.id, f);
  const first = fieldById.get(selectedIds[0]!)?.groupId;
  if (!first) return false;
  for (let i = 1; i < selectedIds.length; i += 1) {
    if (fieldById.get(selectedIds[i]!)?.groupId !== first) return false;
  }
  return true;
}

/**
 * Default tile width / gap used when splitting a multi-signer assignment
 * into N side-by-side single-signer fields. Mirrors the constants in
 * `PlacedField.tsx` so the visual cell sizes line up with the source
 * field's footprint (132 + 8 = 140 px stride).
 */
export const SPLIT_TILE_WIDTH = 132;
export const SPLIT_TILE_GAP = 8;

/**
 * Return a copy of the field with `groupId` removed (not just set to
 * undefined — the `exactOptionalPropertyTypes` tsconfig flag rejects
 * `groupId: undefined`). Centralized so clone/ungroup callers don't
 * each reach for the unused-var rest-spread pattern.
 */
export function withoutGroupId(field: PlacedFieldValue): PlacedFieldValue {
  if (field.groupId === undefined) return field;
  const next: Record<string, unknown> = { ...field };
  delete next['groupId'];
  return next as unknown as PlacedFieldValue;
}

/**
 * Returns true when at least one of the selected fields has a `groupId`.
 * Used to enable the Ungroup toolbar button (you can ungroup any partial
 * subset, not just a whole group).
 */
export function hasAnyGrouped(
  selectedIds: ReadonlyArray<string>,
  fields: ReadonlyArray<PlacedFieldValue>,
): boolean {
  if (selectedIds.length === 0) return false;
  const fieldById = new Map<string, PlacedFieldValue>();
  for (const f of fields) fieldById.set(f.id, f);
  for (const id of selectedIds) {
    if (fieldById.get(id)?.groupId) return true;
  }
  return false;
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
