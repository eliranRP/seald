# `apps/web/src/pages` audit (rules 1.5, 2.4, 4.4)

Audit performed on 2026-04-25 alongside the rule 1.3 standardization batch
(co-located `Page.tsx` + `Page.styles.ts` + `Page.test.tsx` + `Page.stories.tsx`

- `index.ts`). This document lists follow-up items only — the standardization
  itself is already complete in this branch and is not tracked here.

The follow-ups below are **flagged for a separate worktree**; they involve
non-trivial extraction and per-rule "test-before-fix" evidence per the
`react-best-practices` skill. They are **NOT** done here to keep the rule 1.3
batch surgical.

## Rule 1.5 — Route components must be thin

Route components live in `pages/` and "compose feature widgets, no business
logic." The skill flags any single page file over ~400 lines as a candidate
for extracting state machines, derived selectors, and large effect blocks
into `features/<domain>/` hooks + sub-components.

| File                                                           | Lines | Severity | Suggested extraction                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/DocumentPage/DocumentPage.tsx`             | 1463  | High     | Extract the field-selection state machine, clipboard/undo stack, marquee/group-drag controllers, and the keyboard-shortcut handler (currently a single `useEffect` at line 970+ with 8 unrelated chord branches) into a `features/document-editor/` slice with one custom hook per concern. The page should only wire props between the resulting hooks and the existing `<DocumentPageCanvas>` / `<FieldsPlacedList>` / etc. widgets. |
| `apps/web/src/pages/EnvelopeDetailPage/EnvelopeDetailPage.tsx` | 765   | Medium   | Move `eventsToTimeline` (lines 146–287) and the download/reminder/withdraw side-effect handlers into `features/envelopes/` (it already exports the queries; extend with mutation hooks). Page becomes a layout + delegation.                                                                                                                                                                                                           |
| `apps/web/src/pages/SigningFillPage/SigningFillPage.tsx`       | 542   | Medium   | Pull the per-field default-size table, `toUiKind`/`fieldLabel` mappers, signed-URL fetcher, and visible-page IntersectionObserver into `features/signing/lib/` helpers + a `useFillPageObserver` hook.                                                                                                                                                                                                                                 |

Pages already at or under the 400-line guideline (no rule 1.5 action):

- `DashboardPage.tsx` (332)
- `UploadPage.tsx` (325)
- `ContactsPage.tsx` (256)
- `SigningReviewPage.tsx` (252)
- All other pages well under 200 lines.

## Rule 2.4 — `useMemo` / `useCallback` only with measured perf problems

Skill rule 2.4 forbids reflexive memoization without a profiler-backed
justification. Pages with high `useMemo`/`useCallback` density to review:

| File                                                           | Memo+Callback count | Notes                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/DocumentPage/DocumentPage.tsx`             | 47                  | Plausible: many of these stabilize identities passed into memoized children (`<DocumentPageCanvas>`, popovers). Needs a profiler pass before pruning — but `clipboardRef`-style refs would replace several of them. |
| `apps/web/src/pages/SigningFillPage/SigningFillPage.tsx`       | 13                  | Mixed — `fieldsByPage` (line 185) and `fieldCountByPage` (line 197) are reasonable; some of the smaller `useCallback`s wrap one-line handlers and could be inlined.                                                 |
| `apps/web/src/pages/UploadPage/UploadPage.tsx`                 | 10                  | Worth re-checking; the file is small enough that callback identity stability is rarely the issue.                                                                                                                   |
| `apps/web/src/pages/EnvelopeDetailPage/EnvelopeDetailPage.tsx` | 9                   | Same shape — most are handlers used inside callbacks of callbacks; profiler should confirm necessity.                                                                                                               |
| `apps/web/src/pages/DashboardPage/DashboardPage.tsx`           | 7                   | Likely all justified (reduces tab-switch jank); leave as-is.                                                                                                                                                        |

No autofix here — rule 2.4 explicitly requires evidence before removal.

## Rule 4.4 — One responsibility per `useEffect`

| File:Line                                              | Concern                                                                                                                                                                       | Suggested split                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/pages/DocumentPage/DocumentPage.tsx:970` | Single `useEffect` registers a `keydown` listener that dispatches across 8 unrelated chords (Cmd+C, Cmd+V, Cmd+Z, Delete, Cmd+=, Cmd+-, Cmd+0, plus the typing-target guard). | Extract a `useDocumentEditorShortcuts(state)` custom hook that internally registers the listener; or split into per-action effects (clipboard, undo, delete, zoom). Each branch should have its own regression test before splitting (rule 4.4 + skill workflow step 4). |
| `apps/web/src/pages/DocumentPage/DocumentPage.tsx:288` | `IntersectionObserver` for `visiblePages` AND `currentPage` highest-ratio tracking. Two responsibilities (lazy-render gating + active-page state).                            | Split into one effect that maintains `visiblePages`, and a separate observer (or a derived `useMemo` over the same entries via a ref) that updates `currentPage`.                                                                                                        |

Pages already compliant (small, well-scoped effects):

- `AuthCallbackPage.tsx:20+26` — already two effects, one per concern (error redirect / authed redirect). No action.
- `SigningEntryPage.tsx:99` — single effect that owns the token-exchange flow; the inflight-dedupe map is module-level (justified comment in file).
- `SigningFillPage.tsx:167` (signed-URL fetch) and `:205` (visible-page observer) — separate effects, single responsibility each.
- `UploadPage.tsx:80` — one effect, ok.
- `DebugAuthPage.tsx` — one effect that wires Supabase session listener + abort controller; arguably two concerns (initial getSession vs. onAuthStateChange subscription) but they share the cleanup, splitting would duplicate logic. Leave as-is.

## Out-of-scope notes

- DocumentPage extraction was T1's scope and is not pursued here. T1 produced
  no further extraction in this branch; the page is left at 1463 lines so
  this audit captures the residual debt.
- Rule 1.3 (folder layout) — every page is now a folder with the five
  expected files. Stories were added even where the page renders only a
  loading/skeleton state without a backend mock; richer stories should
  follow once an MSW addon is wired up to Storybook.
- E2E coverage for these pages lives under `apps/web/e2e/` (W2's scope) and
  is intentionally untouched.
