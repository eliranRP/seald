# Envelope tags — design

**Date:** 2026-05-10
**Scope:** Piece 2 of 3 in the user's "single screen + filters + tags +
resizable columns" request. This spec covers tagging envelopes plus
the tag filter chip that slots into the toolbar from piece 1
(`docs/superpowers/specs/2026-05-10-dashboard-filter-toolbar-design.md`).

## Goal

Let the user attach short labels ("Urgent", "Wickliff", "Tax 2026") to
envelopes and filter the dashboard by them. Tags are per-user (matches
the existing single-tenant ownership model); same envelope rendered to
two different signed-in viewers can show different tag sets only after
we ship multi-tenant accounts (out of scope).

## Non-goals (deferred)

- Resizable column widths — piece 3.
- Tag rename / merge across envelopes ("rename `urgnet` to `urgent`
  globally"). Tag autocomplete reduces typo divergence; if it
  becomes a problem later we can add a tag-management screen.
- Tag colors picked by the user. Auto-hashed from the tag name.

## Design choices (locked)

| Question | Choice |
|---|---|
| Where to add / remove tags | Dashboard row + detail page |
| Tag entry style | Free-text + autocomplete from prior tags |
| Tag color | Auto from palette via djb2 hash of the tag name |
| Visible on dashboard rows | Yes, small chips next to title |
| Filter chip in toolbar | Multi-select like Status; OR within chip |
| URL contract | `?tags=foo,bar` (lowercased, comma-separated) |
| Normalization | Lowercase + trim on save |
| Per-tag length limit | 32 chars (matches contact-name max) |
| Per-envelope tag limit | 10 (defensive — keeps the row readable) |

## Architecture

### Data model

```sql
-- 0016_envelopes_tags.sql
alter table envelopes add column tags jsonb not null default '[]'::jsonb;
```

Mirrors the existing `templates.tags jsonb` column. Stored as a JSON
string array (validated at the API boundary, never trusted from the
DB). Default `[]` so the column is non-null and existing rows
backfill cleanly.

### Shared contract

```ts
// packages/shared/src/envelope-contract.ts
export const EnvelopeSchema = z.object({
  // …existing fields…
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
});
```

Add `tags` to `EnvelopeListItemSchema.pick({…})` so the dashboard
list response carries them.

### API surface

Extend the existing `PATCH /envelopes/:id` instead of adding a
new endpoint:

```ts
// PatchEnvelopeDto
@IsOptional()
@IsArray()
@ArrayMaxSize(10)
@IsString({ each: true })
@MaxLength(32, { each: true })
readonly tags?: string[];
```

`envelopes.service.ts` normalises (`map(t => t.trim().toLowerCase())`)
and de-dupes before persisting. Existing PATCH already handles
audit-event emission for envelope updates; tags ride that same path.

### Frontend filter wiring

Extend `EnvelopeFilters`:

```ts
readonly tags: ReadonlyArray<string>; // lower-cased
```

`parseFilters` handles `?tags=foo,bar`; `serializeFilters` writes the
same shape (`tags.join(',')`). `filterEnvelopes` adds a final AND
predicate: at least one tag in the envelope must intersect the
selected set.

The default filter (actionable inbox) is unchanged. Tag filter is
purely additive.

### Components

#### `<TagChip>` (new)
Tiny pill, 11 px font, djb2-hashed background colour (reuse the same
hash function used by `Avatar.pickTone` from PR #224 but map to a
broader 8-color soft-tinted palette so the chips read distinct
without looking neon). Optional `onRemove` callback renders a × at
the right edge.

#### `<TagEditor>` (new)
Inline composer used by both the dashboard row's "+" affordance and
the envelope detail page's Tags section.

- Renders the current chip list (with × per chip).
- Below: an autocomplete `<input>` whose suggestions are the
  user's previously-used tags filtered by the input substring (the
  toolbar's `uniqueTags` derivation is reused).
- Press Enter → adds the typed value (after normalisation). If the
  value matches a suggestion, picks it. If not, creates a new tag.
- Backspace at empty input removes the last chip.
- Calls back with the new array; the page is responsible for the
  PATCH.

#### `<TagsChipPopover>` (new — slots into FilterToolbar)
Mirrors the Status chip's UX: multi-select checkboxes per distinct
tag, an inline search input narrows the visible list, header
"Deselect all / Select all" toggle.

#### Dashboard row
Render up to 3 chips inline after the title, then `+N` for overflow.
Hovering the row reveals an inline "+ Tag" affordance that pops the
`<TagEditor>`. Saving writes via `PATCH /envelopes/:id` and React
Query invalidates the list.

#### Envelope detail page
A "Tags" section in the page chrome (above the activity timeline)
with the same `<TagEditor>`. Larger surface; not a popover.

## URL contract delta

`parseFilters` adds:

| Param | Format | Example |
|---|---|---|
| `tags` | comma-separated lowercased strings | `?tags=urgent,tax-2026` |

Multi-select within the chip is OR; combined with the other chips it's
AND. Matches the spec from piece 1.

## Tests

| Layer | What it asserts |
|-------|-----------------|
| `0016` migration test | Column exists, default is `[]`, existing rows backfill. |
| API service spec | PATCH normalises, de-dupes, enforces 10-tag cap, rejects > 32 chars. |
| API e2e | `PATCH /envelopes/:id` round-trips tags; subsequent `GET` returns them; non-owner is rejected. |
| `parseFilters.test.ts` | `?tags=` round-trip + lowercase + empty handling. |
| `filterEnvelopes.test.ts` | OR within tag chip; AND with status / search; empty selection = no filter. |
| `TagChip.test.tsx` | Stable color per name; remove callback fires. |
| `TagEditor.test.tsx` | Autocomplete shows prior tags; Enter creates; Backspace removes; cap at 10; trim + lower-case. |
| `TagsChipPopover.test.tsx` | Multi-select checkbox toggles update URL; portal escape (matches FilterChipPopover pattern). |
| `DashboardPage.test.tsx` | Row chips render; `?tags=urgent` narrows the list. |

## Risk + rollback

- Migration is additive (`add column … default '[]'::jsonb`). Down
  migration drops the column. Reverting the PR before any production
  rows write tags is a no-op for end users.
- API DTO change is backwards-compatible (`tags` optional). Older
  SPA builds that don't send `tags` continue to work; the field
  stays at its previous value.
- Frontend filter is additive; default behaviour unchanged.

## Local review checkpoint

User has explicitly delegated this batch (see
`feedback_autonomous_mode_directive.md`) — implement, gate, push,
watch CI, merge without intervention. The dev server running
locally on `localhost:5173` will pick up changes via HMR for
post-merge inspection.
