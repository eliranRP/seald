# Dashboard column sorting — design (server-side, sort-aware cursor)

**Date:** 2026-05-11
**Scope:** Click-to-sort on the dashboard table columns. The sort is
performed **server-side**: clicking a header re-queries `GET /envelopes`
with `?sort=&dir=`, and keyset pagination is made sort-aware so the
cursor stays consistent for any sort key. Builds on the filter toolbar
(#226) and resizable columns (#228).

## Goal

Click a column header → the table re-fetches ordered by that column.
Three clicks cycle ascending → descending → default (date, newest-
first). The active header shows a ▲/▼ caret. The sort key + dir live
in the URL (`?sort=title&dir=asc`) so the view is bookmarkable.

## Non-goals (deferred)

- Multi-column sort.
- Reordering columns (the resize handle owns the right edge).

## Wire contract

`GET /envelopes?sort=<key>&dir=<asc|desc>&limit=&cursor=`

| `sort` value | server order-by expression |
|---|---|
| `date` (default) | `updated_at` |
| `created` | `created_at` |
| `title` | `title` (collated; Postgres default `LOWER(title)` is *not* used — plain `title` keeps it index-friendly; case-folding is good enough for the dashboard) |
| `status` | a `CASE` mapping each status to a fixed ordinal: draft 0, awaiting_others 1, sealing 2, completed 3, declined 4, expired 5, canceled 6 |
| `signers` | `(select count(*) from envelope_signers s where s.envelope_id = e.id)` |
| `progress` | `coalesce(signed_count::float / nullif(total_count, 0), 0)` where both counts come from a single correlated subquery / lateral over `envelope_signers` |

`dir`: `asc` | `desc`. Default `desc`.

**Validation:** `sort` must be one of the literals above (else 400
`validation_error`); `dir` must be `asc`/`desc` (else 400). Missing →
defaults. The frontend never sends an invalid value, but the API
validates anyway.

### Sort-aware cursor

Today the cursor is `base64("<updated_at>|<id>")` — a 2-tuple keyset on
`(updated_at, id)`. To make pagination consistent for *any* sort key,
the cursor becomes a **3-tuple**:

```
base64("<sortValue>|<updated_at>|<id>")
```

- `sortValue` is the stringified value of the active sort expression
  for the last row of the page (an ISO date, a title, the status
  ordinal, the signer count, or the progress ratio — always stringified).
- `(updated_at, id)` is the always-unique tie-break, so the 3-tuple
  is a total order even when many rows share the same `sortValue`.

The keyset WHERE clause on the next page is the lexicographic
`(sortExpr, updated_at, id) <comparator> (sortValue, updated_at, id)`
in the chosen direction — the standard "row-value comparison" keyset
pattern, expanded to handle the `sortValue` being a string vs number
(we compare as the column's native type by re-parsing).

**Migration:** the cursor format is opaque base64; old 2-tuple cursors
won't decode under the new 3-tuple parser. We treat an undecodable
cursor the same as an absent one (start from the top) — already the
behavior for any malformed cursor (`InvalidCursorError` → 400 today;
we soften it to "ignore and restart" only for the legacy-shape case,
or just keep the 400 since the SPA always re-issues a fresh request
without a stale cursor after a deploy). **Decision:** keep the 400
for genuinely malformed cursors; the SPA's React Query cache is keyed
by params so a deploy invalidates old cursors naturally.

## Backend changes

- `ListEnvelopesQueryDto` (or wherever the list query params are
  validated in `envelopes.controller.ts`) gains `sort?: string` +
  `dir?: string` with `@IsIn` guards.
- `EnvelopesService.list` threads `sort`/`dir` through; the cursor
  decode now yields `{ sortValue: string; updated_at: string; id: string }`.
- `EnvelopesPgRepository.listByOwner`:
  - SELECTs two computed columns alongside `selectAll()`:
    `signer_count` and `progress` (via correlated subqueries).
  - Resolves the ORDER BY expression from the `sort` key.
  - Applies the 3-tuple keyset WHERE when a cursor is present.
  - `encodeCursor` / `decodeCursor` updated to the 3-tuple format;
    `decodeCursor` throws `InvalidCursorError` on a 2-part legacy
    cursor (same as any other malformed input).
- `InMemoryEnvelopesRepository.listByOwner` (test double): mirror the
  logic in JS — compute `signerCount` / `progress` per envelope, sort
  by the resolved key + dir + `(updated_at desc, id asc)` tie-break,
  apply the keyset slice from the 3-tuple cursor.

## Frontend changes

- `listEnvelopes(params)` / `ListEnvelopesParams` gain `sort?: SortKey`
  + `dir?: SortDir`; included in the query string.
- `useEnvelopesQuery` passes them through; React Query keys on the
  params object so a sort change triggers a refetch.
- `features/dashboardFilters/sortEnvelopes.ts` shrinks to **just the
  URL contract**: `SortKey`, `SortDir`, `SortState`, `SORT_KEYS`,
  `DEFAULT_SORT`, `parseSort(URLSearchParams)`. No client-side sort
  function — the server returns rows pre-ordered. (File could be
  renamed to `sortParams.ts`; keeping the name to minimise churn.)
- `DashboardPage`:
  - `const sort = parseSort(searchParams)`.
  - `useEnvelopesQuery(true, { limit: 100, sort: sort.key, dir: sort.dir })`.
  - Header click handler: not-active → `?sort=<key>&dir=asc`;
    active+asc → `&dir=desc`; active+desc → strip both params
    (back to default). Written via `setSearchParams`.
  - Each `HeadCell` hosts a `<button>` label + caret; `aria-sort` on
    the cell reflects state. The `ColumnResizeHandle` stays pinned
    to the right edge, untouched.
  - No `sortEnvelopes` call — `filtered` (post-`filterEnvelopes`) is
    rendered as-is, in the order the API returned. (Note:
    `filterEnvelopes` is a client-side narrowing pass that preserves
    input order, so the server order survives it.)

## Accessibility

`HeadCell` gets `role` left as a grid cell; the inner label is a
`<button type="button">` with the column name as its accessible name;
the caret is `aria-hidden`. `aria-sort` on the `HeadCell` is
`"ascending"` / `"descending"` on the active column, `"none"`
otherwise.

## Tests

| Layer | Asserts |
|---|---|
| `envelopes.service.spec.ts` / repo specs | `list` validates `sort`/`dir`; rejects bogus values; threads defaults; cursor round-trips as a 3-tuple; in-memory repo orders by each key in both directions; keyset slice from a cursor returns the right next page including the `signer_count` / `progress` tie-break. |
| API e2e (`envelopes.e2e-spec.ts` if present) | `GET /envelopes?sort=title&dir=asc` returns rows A→Z; `?sort=progress&dir=desc` returns the most-complete first; an invalid `sort` → 400. |
| `parseSort` (frontend) | Defaults; valid parse; bogus → default. |
| `DashboardPage.test.tsx` | Clicking the Document header sets `?sort=title&dir=asc` and the `/envelopes` request includes those params (assert via the mocked apiClient's recorded URL); second click → `dir=desc`; third click → params stripped; active header carries `aria-sort`. |

## Risk + rollback

- The cursor format change is the riskiest bit. Mitigated by: (a) the
  SPA never re-uses a cursor across a page reload (React Query cache
  is in-memory + keyed by params), and (b) malformed cursors already
  400, so a stale 2-tuple cursor fails cleanly and the SPA re-fetches
  page 1.
- The `progress` subquery is the heaviest new SQL. For ≤100-row pages
  on a per-owner index it's negligible; if it ever shows up in slow
  logs the fix is a materialised `progress` column updated by trigger
  — out of scope here.
- Reverting the PR: drop the `sort`/`dir` params (server ignores
  unknown query params), drop the header buttons. The list renders
  in `updated_at desc` order as before.

## Local review checkpoint

Default cadence; ships through CI like the recent fixes (velocity
this session). Dev server on :5173 picks it up via HMR.
