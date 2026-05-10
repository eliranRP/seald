# Resizable dashboard columns — design

**Date:** 2026-05-10
**Scope:** Piece 3 of 3 in the user's "single screen + filters + tags +
resizable columns" request. Covers drag-to-resize column widths on the
dashboard table, with widths persisted in `localStorage` so each user
keeps their layout across sessions.

## Goal

Match Monday.com / Linear: the user grabs a tiny vertical handle
between two columns and drags. The grid columns reflow live; on drop
the new widths persist in `localStorage`.

## Non-goals (deferred)

- Server-side persistence of widths across devices. `localStorage` is
  per-browser, which is the de-facto convention for layout knobs.
- Reordering columns (drag the entire column header). Different gesture,
  separate spec if we ever want it.
- Hide / show columns. Same — separate UX.

## Architecture

### `useColumnWidths` hook (new)

```ts
interface ColumnSpec { readonly key: string; readonly default: number; readonly min?: number }
function useColumnWidths(specs: ReadonlyArray<ColumnSpec>, storageKey: string): {
  readonly widths: Record<string, number>;
  readonly setWidth: (key: string, px: number) => void;
  readonly resetAll: () => void;
};
```

- Reads from `localStorage.getItem(storageKey)` lazily on mount.
  Malformed JSON / missing keys fall back to each spec's default.
- `setWidth` merges and writes back synchronously (debounced via
  `requestAnimationFrame` so a 60 fps drag doesn't burn IO).
- Per-column `min` (defaults to 80 px) clamps the value at write time
  so the table never gets squashed past readability.

### `<ColumnResizeHandle>` primitive (new)

A 6 px-wide drop-zone between two columns. On `pointerdown`:
- Captures pointer (`setPointerCapture`).
- Snapshots the current column width and the cursor's `clientX`.
- On `pointermove`, computes the delta and calls `onResize(currentWidth + delta)`.
- On `pointerup`, releases capture and calls `onResizeEnd()` so the
  parent can persist.
- During the drag, the handle gets a visible accent + the cursor
  switches to `col-resize`.

Hosted inside the `TableHead` cell of each column except the first
and the chevron column.

### Integration with `DashboardPage`

The current grid template is a static string:

```ts
const GRID = '1.3fr 1.5fr 1fr 180px 100px 60px';
```

Becomes a stateful template derived from `useColumnWidths`. Each
column key maps to a single CSS length unit (we keep the chevron
fixed at 60 px and only allow resizing on the four content columns).

Ordering in the same place: Document | Signers | Progress | Status |
Date | (chevron — fixed).

## Storage contract

Key: `seald.dashboard.columns.v1`. Value:

```json
{ "document": 320, "signers": 220, "progress": 180, "status": 180, "date": 110 }
```

If any key is missing or non-numeric, the consumer falls back to the
spec default. Schema-version bumps (e.g. adding tags column later)
ship a new key (`v2`) and discard the old.

## Tests

| Layer | What it asserts |
|-------|-----------------|
| `useColumnWidths.test.ts` | Defaults applied when storage is empty; restored on remount; `setWidth` clamps to `min`; rAF batches writes; `resetAll` wipes the key. |
| `ColumnResizeHandle.test.tsx` | Pointer capture round-trip; `onResize` fires with cumulative deltas during move; `onResizeEnd` fires once on up. |
| `DashboardPage` | The header grid template uses the widths from the hook; dragging a handle updates the rendered template. (jsdom — assert the inline `style` after a synthetic pointer-move sequence.) |

## Risk + rollback

- Pure UI; no API or DB change. Reverting the PR goes back to the
  static grid with no data migration.
- `localStorage` may be disabled (Safari Private). Hook gracefully
  degrades: writes throw → caught → no persistence; widths reset
  to defaults on next visit.

## Local review checkpoint

Per `feedback_autonomous_mode_directive.md` — autonomous mode is
still active. Ship through CI without local review gate.
