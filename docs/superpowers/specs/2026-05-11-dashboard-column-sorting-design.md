# Dashboard column sorting — design

**Date:** 2026-05-11
**Scope:** Click-to-sort on the dashboard table columns, with the sort
key + direction in the URL so views are bookmarkable. Builds on the
filter toolbar (#226) and the resizable columns (#228).

## Goal

Click a column header → sort the visible rows by that column. Three
clicks cycle ascending → descending → default (Date, newest-first).
The active column shows a ▲/▼ caret.

## Non-goals (deferred)

- Multi-column sort (shift-click to add a secondary key).
- Server-side sort. The list is capped at 100 rows client-side; an
  in-memory sort is plenty.
- Drag-to-reorder columns (different gesture; the resize handle owns
  the right edge already).

## Architecture

### `sortEnvelopes` pure helper (new — `features/dashboardFilters/sortEnvelopes.ts`)

```ts
type SortKey = 'document' | 'signers' | 'progress' | 'status' | 'date';
type SortDir = 'asc' | 'desc';
interface SortState { readonly key: SortKey; readonly dir: SortDir }
const DEFAULT_SORT: SortState = { key: 'date', dir: 'desc' };

function sortEnvelopes(
  list: ReadonlyArray<EnvelopeListItem>,
  sort: SortState,
): ReadonlyArray<EnvelopeListItem>;
```

Comparators (ascending; `dir === 'desc'` reverses the result):

| key | comparator |
|---|---|
| `document` | `a.title.localeCompare(b.title)` (case-insensitive via `localeCompare` default) |
| `signers` | `a.signers.length - b.signers.length` |
| `progress` | `pct(a) - pct(b)` where `pct(e) = e.signers.length === 0 ? 0 : signedCount(e) / e.signers.length`; `signedCount` counts signers with `status === 'completed'` |
| `status` | `STATUS_ORDINAL[a.status] - STATUS_ORDINAL[b.status]` |
| `date` | `Date.parse(a.updated_at) - Date.parse(b.updated_at)` |

`STATUS_ORDINAL`: `draft 0`, `awaiting_others 1`, `sealing 2`,
`completed 3`, `declined 4`, `expired 5`, `canceled 6`.

**Tie-break:** when the primary comparator returns 0, fall back to
`updated_at` **descending**, then `id` ascending — so a re-render
never reshuffles equal rows. (`Array.prototype.sort` is stable in
every engine we target, but the explicit tie-break makes the order
deterministic regardless of input ordering from the API.)

Pure; does not mutate the input — returns a fresh array.

### `parseSort` (new — same file)

```ts
function parseSort(params: URLSearchParams): SortState;
```

- `sort` ∈ {document, signers, progress, status, date}; anything else
  → `DEFAULT_SORT.key`.
- `dir` ∈ {asc, desc}; anything else → `DEFAULT_SORT.dir`.
- No `sort` param at all → `DEFAULT_SORT` (date desc).

Companion writer is folded into the existing `DashboardPage` URL
plumbing (it already does targeted `URLSearchParams` deletes/sets for
the filter chips) — no new `serializeSort`; the page just sets/deletes
`sort` and `dir` directly.

### `DashboardPage` integration

1. `const sort = useMemo(() => parseSort(searchParams), [searchParams])`.
2. `const sorted = useMemo(() => sortEnvelopes(filtered, sort), [filtered, sort])`.
   The `filtered` list (from `filterEnvelopes`) feeds straight in;
   `renderDocumentsBody` consumes `sorted`.
3. Header cells gain a `<SortButton>` wrapping the label + caret. The
   `ColumnResizeHandle` stays as-is (pinned to the right edge, 6 px;
   the label button fills the rest). Clicking the label:
   - Not the active column → set `sort=<key>&dir=asc`.
   - Active column, `asc` → flip to `desc`.
   - Active column, `desc` → strip `sort` + `dir` (back to default).
4. Caret rendering: on the active column, a `▲` for `asc` / `▼` for
   `desc`. Inactive columns show no caret (a faint `↕` on hover is a
   NICE-TO-HAVE, not in this PR).

The chevron column header (`<div aria-hidden />`) is not sortable.

## Accessibility

- Each sortable header label is a `<button type="button">` inside the
  `HeadCell`. `aria-sort` on the `HeadCell` reflects state:
  `"ascending"` / `"descending"` on the active column, `"none"`
  elsewhere. The button's accessible name is the column label; the
  caret glyph is `aria-hidden`.

## Tests

| Layer | What it asserts |
|---|---|
| `sortEnvelopes.test.ts` | Each comparator orders correctly asc + desc; progress handles zero-signer envelopes; tie-break by `updated_at` desc then `id`; input is not mutated. |
| `parseSort.test.ts` (or folded into the same file) | Defaults when no param; valid `sort`/`dir` parsed; bogus values fall back to default. |
| `DashboardPage.test.tsx` | Clicking the Document header sorts rows A→Z (assert DOM order via `getAllByRole('button', { name: /Open / })`); a second click reverses; a third resets to date-desc; the active header carries `aria-sort`. |

## Risk + rollback

- Pure UI; no API/DB change. Reverting the PR drops the sort affordance
  and the table renders in the API's default order again.
- `Date.parse` of a malformed `updated_at` would yield `NaN` — guarded
  by treating `NaN` as `0` so a bad row sinks to a stable position
  rather than throwing.

## Local review checkpoint

Default cadence (review-before-push) — but given the velocity this
session and the small surface, this ships through CI like the recent
fixes. Dev server on :5173 picks it up via HMR for inspection.
