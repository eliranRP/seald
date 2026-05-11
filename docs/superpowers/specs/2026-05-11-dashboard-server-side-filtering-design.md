# Dashboard server-side filtering — design

**Date:** 2026-05-11
**Scope:** Move the dashboard's table filtering (search / status-bucket /
date / signer / tags) from the client into `GET /envelopes`'s SQL
`WHERE`. The toolbar's facets (per-bucket counts, distinct signer /
tag lists) keep deriving from a *second, unfiltered* fetch so they
stay accurate. Builds on the filter toolbar (#226), tags (#227), and
server-side sort (#230).

## Goal

The dashboard table reflects the active filters via a server query, so
correctness no longer caps at the first 100 rows. The toolbar chips
keep showing counts / option lists over the user's full envelope set
(via the unfiltered fetch — same accuracy as today).

## Non-goals

- True beyond-100 facet counts (a `count(*) group by bucket` endpoint).
  The toolbar facets stay at their current accuracy (the unfiltered
  fetch's `limit: 100`). If that ever bites, a `/envelopes/facets`
  endpoint is the follow-up.
- Server-side *sort* — already done (#230); unchanged here.

## API contract — `GET /envelopes` new query params

| param | shape | SQL clause (all `AND`-combined; `e` = `envelopes`) |
|---|---|---|
| `q` | substring | `(lower(e.title) like lower('%'||:q||'%') or lower(e.short_code) like lower('%'||:q||'%'))` |
| `bucket` | comma-separated subset of {`draft`,`awaiting_you`,`awaiting_others`,`sealed`,`declined`} | `OR` of one clause per bucket — see below |
| `date` | `today` \| `7d` \| `30d` \| `thisMonth` \| `custom:YYYY-MM-DD:YYYY-MM-DD` | `e.updated_at >= :from and e.updated_at < :to` (server resolves the window; `now` is server-side) |
| `signer` | comma-separated emails | `exists (select 1 from envelope_signers s where s.envelope_id = e.id and lower(s.email) in (:emails))` |
| `tags` | comma-separated tag names | `OR` of `e.tags @> '["<tag>"]'::jsonb` per tag |

**Bucket clauses** (the dashboard's status vocabulary — `awaiting_you`
is "the auth'd user is a still-pending signer", not a column value):
- `draft` → `e.status = 'draft'`
- `sealed` → `e.status = 'completed'`
- `declined` → `e.status = 'declined'`
- `awaiting_you` → `e.status in ('awaiting_others','sealing') and exists (select 1 from envelope_signers s where s.envelope_id = e.id and lower(s.email) = lower(:viewerEmail) and s.signed_at is null and s.declined_at is null)`
- `awaiting_others` → `e.status in ('awaiting_others','sealing') and not exists (… same exists …)`

The existing literal `?status=` param (maps to `envelopes.status`
column values, used by other callers) is left untouched — `bucket` is
the new, dashboard-aware param.

**Validation** (service layer, 400 `validation_error` on a bad value):
unknown `bucket` token; unknown `date` preset / malformed `custom:`
range; (no validation needed on `q` / `signer` / `tags` — any string
is a valid substring / email-list / tag-list).

**`viewerEmail`** is threaded `controller (@CurrentUser().email) →
service → repo` — needed for the `awaiting_you` / `awaiting_others`
buckets. When a `bucket` filter that needs it is requested but the
auth user has no email (shouldn't happen for an authenticated
session), the `exists` clause simply never matches → `awaiting_you`
returns nothing, `awaiting_others` returns everything in those
statuses (correct fallbacks).

**Cursor:** unchanged. Filters are extra `AND`s; the 3-tuple keyset is
on the sort expression, which the filters don't touch.

**pg-mem note:** `like` with `lower()`, `exists` correlated
subqueries, `in (...)` lists — all run in pg-mem (already used
elsewhere in this repo). `jsonb @>` is the one uncertainty; if pg-mem
chokes I'll fall back to `exists (select 1 from jsonb_array_elements_text(e.tags) t where t in (:tags))`,
and if *that* fails, ship the other four filters server-side and keep
the `tags` filter client-side (documented partial). The test run
decides.

## Frontend changes

- `ListEnvelopesParams` gains `q?: string`, `bucket?: string[]`,
  `date?: string`, `signer?: string[]`, `tags?: string[]`;
  `listEnvelopes` serializes them onto the query string (joining the
  array params with `,`).
- New `features/dashboardFilters/filtersToQueryParams.ts` —
  `EnvelopeFilters → ListEnvelopesParams`-shaped filter object. Mostly
  1:1; `date: DateFilter` re-serializes to `7d` / `custom:from:to` /
  (omitted when `all`). The dashboard's `StatusOption` vocabulary
  already equals the API's `bucket` vocabulary, so `status[] →
  bucket[]` is a passthrough.
- `DashboardPage`:
  - **Table query** — `useEnvelopesQuery(true, { limit: 100, sort,
    dir, ...filtersToQueryParams(parsedFilters) })`. Its `items` are
    rendered directly; no client-side `filterEnvelopes` pass.
  - **Toolbar/stats query** — `useEnvelopesQuery(true, { limit: 100,
    sort: 'date', dir: 'desc' })` (no filter params). React Query
    dedups it with the table query whenever no filter is active.
    `FilterToolbar` and the stat cards consume *this* list.
  - `filterEnvelopes` is removed from the page. `bucketEnvelope` /
    `isAwaitingYou` stay exported — `FilterToolbar` still uses
    `bucketEnvelope` for the per-bucket counts over the unfiltered
    list, and the dashboard's "Awaiting you" row badge still uses
    `isAwaitingYou`.
  - Loading state: the table shows skeletons while the *table* query
    is pending; the empty-envelope-illustration shows when the table
    query resolves with `items.length === 0`.

## Tests

| Layer | Asserts |
|---|---|
| `envelopes.service.spec.ts` | `list` filters the fake-repo results by `q` / `bucket` (incl. `awaiting_you` honoring `viewerEmail`) / `date` / `signer` / `tags`; rejects an unknown `bucket` token and a malformed `date`. (The fake repo's `listByOwner` gains the filter logic, mirroring the in-memory repo.) |
| in-memory repo | `listByOwner` applies all five filters in JS. |
| `filtersToQueryParams.test.ts` | `EnvelopeFilters → ListEnvelopesParams` mapping; `date` re-serialization (preset, custom, all-omitted); empty arrays omitted. |
| `DashboardPage.test.tsx` | Applying a status filter sends `?bucket=draft` (or whatever) on the `/envelopes` request; a search sends `?q=`; the toolbar still shows non-zero counts (they come from the unfiltered fetch); the table reflects the filtered response. |

`filterEnvelopes.test.ts` is **deleted** along with `filterEnvelopes`
(its OR/AND/predicate behavior moves to the repo + is covered by the
service spec). `bucketEnvelope` / `isAwaitingYou` keep their existing
coverage via `filterEnvelopes.test.ts`'s `bucketEnvelope` cases —
those move to a small `bucketEnvelope.test.ts`.

## Risk + rollback

- Two `/envelopes` fetches per dashboard load when a filter is active
  (deduped to one otherwise). Both are `limit: 100` per-owner queries
  on an indexed `owner_id` — negligible.
- `jsonb @>` is the SQL risk; mitigated by the fallback ladder above.
- Reverting the PR: drop the new query params (server ignores unknown
  ones), re-add the client-side `filterEnvelopes` pass. No data
  migration.

## Local review checkpoint

Default cadence; ships through CI like the recent PRs given the
session velocity. Dev server on :5173 picks it up via HMR.
