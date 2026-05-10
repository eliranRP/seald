# Dashboard filter toolbar — design

**Date:** 2026-05-10
**Scope:** Piece 1 of 3 in the user's "single screen with filters + tags + resizable columns" request. This spec covers only the tabs → filter-toolbar refactor. Tags is piece 2; resizable columns is piece 3, each with its own spec.

## Goal

Replace the dashboard's status tabs (`All / Awaiting you / Awaiting others / Sealed / Drafts`) with a single horizontal filter toolbar above the envelope table. Filter state lives in the URL so views are shareable and survive refresh / back-forward.

Default state on first visit: actionable inbox (Awaiting you + Awaiting others). Two clicks (Status ▾ → Select all) widens to everything.

## Non-goals (deferred to later pieces)

- Tag chips on envelopes and tag filtering — piece 2.
- Resizable column widths — piece 3.
- Per-user persistence of filters beyond the URL — out of scope.

## Architecture

```
DashboardPage
  ├─ <StatGrid />                 (unchanged)
  ├─ <FilterToolbar>              (NEW — replaces <FilterTabs />)
  │     ├─ <SearchChip>           free-text on doc title + envelope code
  │     ├─ <MultiSelectChip>      Status — checkboxes + counts
  │     ├─ <DateRangeChip>        presets + custom range
  │     ├─ <SignerChip>           signer-name/email lookup
  │     └─ <ClearChip>            visible only when ≥1 filter active
  └─ <Table>                      filtered via useMemo over the search-params
```

`FilterToolbar` reads / writes via `useSearchParams`. The page applies a single `useMemo` that combines all four filters against the envelope list. The existing `FilterTabs` import is removed; the component itself stays in the library if other pages still use it (verify before deleting).

## URL contract

| Param   | Format                                                | Example                                |
|---------|-------------------------------------------------------|----------------------------------------|
| `q`     | URI-encoded substring (lowercased on read)            | `?q=waiver`                            |
| `status`| comma-separated subset of {`draft`,`awaiting_you`,`awaiting_others`,`sealed`,`declined`} | `?status=awaiting_you,awaiting_others` |
| `date`  | preset key OR `custom:<from>:<to>` (ISO yyyy-mm-dd)   | `?date=7d` or `?date=custom:2026-04-01:2026-05-10` |
| `signer`| URI-encoded email (exact-match) OR substring of name  | `?signer=alice@example.com`            |

**No params present** → apply the default actionable-inbox filter (`status=awaiting_you,awaiting_others`).

**`status=all` sentinel** → user has explicitly opted into "everything". Without this sentinel, "no `status` param" can't disambiguate between *first visit* (apply default) and *user cleared the chip* (show all). With it, the URL becomes:
- first visit → no `status` → render with default
- user clicks all checkboxes in the chip → `?status=all` → render with no status filter
- user picks specific subset → `?status=draft,sealed` → render with that subset

**Invariant:** any param that fails to parse is silently ignored (filter behaves as if absent). No error toasts for malformed URLs.

## Defaults & special cases

- First visit (no params): default to `status=awaiting_you,awaiting_others`. After the first filter change, the user's choices are reflected verbatim.
- "Select all" status → omit `status` from URL (clean slate).
- Search debounced 250 ms before URL update.
- Date filter pegs to **last activity** (`updated_at`), matching the table's existing `DATE` column.
- Signer filter matches if any of the envelope's signers' name OR email contains the substring (case-insensitive).
- All four filters AND together; status options OR within the chip.

## Empty state

When filters narrow the result set to zero rows: render a small inline message ("No envelopes match these filters.") with a `Clear filters` button. The stat cards above stay visible.

## Components

### `<FilterToolbar />`
Top-level container. No props (it owns no state beyond the URL). Lays out children with `display: flex; gap: 8px; flex-wrap: wrap;` so it reflows on narrow viewports.

### `<FilterChipPopover />` (primitive)
Generic shell every chip uses. Renders the trigger button + a portaled popover (escapes any `overflow: hidden` ancestor — same pattern as the SignerStack popover fix from PR #225). Props: `label`, `value` (compact preview), `active` (boolean for amber accent), `onClear`, `children` (popover body).

### `<SearchChip />`
Inline input, not a popover. 250 ms debounced; writes `q` to URL. Clear "✕" inside the input.

### `<MultiSelectChip />` (used by Status)
Checkbox list. Each option may render a count to its right. "Select all / Clear" links at the top of the popover.

### `<DateRangeChip />`
Preset options + "Custom range…" footer that reveals two date inputs.

### `<SignerChip />`
Search input + scrollable list of distinct signers across the user's envelopes (derived in `useMemo` over the envelope list).

### `<ClearChip />`
One-button shortcut that strips every filter param from the URL.

## Data flow

```
useSearchParams()  →  parseFilters(params)  →  filterEnvelopes(envelopes, parsed)  →  rendered rows
                ↑                          ↓
                └────  setSearchParams  ←──┘
                       (called by chips)
```

`parseFilters` is a pure helper (`apps/web/src/features/dashboardFilters/parseFilters.ts`) — easy to unit-test the URL contract without a dom.

`filterEnvelopes` is also pure. Already-existing logic in `DashboardPage.tsx` (the `FilterTabs` predicates) is extracted into this helper.

## Tests

| Layer | What it asserts |
|-------|-----------------|
| `parseFilters.test.ts` (unit) | Each URL param shape resolves to the right filter object; malformed values are silently ignored. |
| `filterEnvelopes.test.ts` (unit) | Status / date / signer / search predicates AND together correctly. |
| `FilterToolbar.test.tsx` (component) | Selecting an option updates URL; Clear strips all params; popovers portal to body (escapes overflow). |
| `DashboardPage.test.tsx` (existing — extend) | Default URL → actionable inbox; status filter narrows visible rows; empty state shown when no matches. |

No new Cucumber feature file for this piece — the existing E2E covers the table; this refactor doesn't change its observable behavior at the row level. (We can revisit if regressions appear.)

## Risk + rollback

- Same React Query / data-fetch layer as today; no API changes.
- The four chip popovers all use the portal pattern proven in PR #225 — no overflow-clipping risk.
- Rollback = revert the PR; the old `FilterTabs` component and its test stay in the library so the revert is one commit, not a code-restoration job.

## Local review checkpoint

Per the user's standing rule (2026-05-10): I run `pnpm --filter web dev` and surface localhost; the user walks the page (clicks each chip, types a search, verifies URL state, checks empty state and the actionable-inbox default). Only after the user signs off do I push to a branch and open a PR.
