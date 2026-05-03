# Surface 2 — Drive picker modal

Triggered from: New Document flow + Use Template flow (see surfaces 3 & 4)
Dimensions: 720 × 560 px modal, centered, scrim background

## Default state (file list, root folder)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Pick from Google Drive                                       [ × ] │
│  ─────────────────────────────────────────────────────────────────  │
│  ⌂ My Drive  /                                eliran@example.com ▾ │ ← acct switcher (v1: shown only if >1 acct)
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  [ 🔍 Search PDFs and Docs in Drive...                          ]   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  📁  Contracts                          12 items     › │ │
│  │  📁  HR                                  4 items     › │ │
│  │  📄  2026 NDA template.gdoc       Doc · 2 days ago     │ │
│  │  📄  Acme MSA - signed.pdf        PDF · 14 KB · Apr 28 │ │
│  │  📄  Vendor agreement.docx        Word · 32 KB · Apr 1 │ │
│  │  📄  ...                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Showing PDFs, Google Docs, and Word documents.                     │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│            [ Cancel ]                       [ Use this file ]       │
│                                              ↑ disabled until pick  │
└─────────────────────────────────────────────────────────────────────┘
```

**Primary CTA:** `[ Use this file ]` — disabled until a file row is
selected. On click → closes modal + emits the chosen file to the
parent flow.

---

## Folder navigation (breadcrumb)

```
⌂ My Drive  /  Contracts  /  Acme               eliran@example.com ▾
```

Each breadcrumb segment is a link; clicking jumps back. Current segment
is bold + non-clickable.

---

## Selected state (one file picked)

```
│  📄  Acme MSA - signed.pdf        PDF · 14 KB · Apr 28      ✓     │
        ↑ row gets indigo highlight + check
```

`[ Use this file ]` enables, primary indigo button.

---

## Empty states

### Empty folder

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                       📂                                      │
│                                                               │
│        This folder doesn't have any PDFs or Docs.             │
│        Try a different folder.                                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### No filter matches

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                       🔍                                      │
│                                                               │
│        No files match "kjaslkdjklasjd".                       │
│        Try a different search.                                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Error states

### Token expired / revoked

```
┌─────────────────────────────────────────────────────────────────────┐
│  Pick from Google Drive                                       [ × ] │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ⚠ Your Google Drive connection expired.                            │
│    Reconnect to continue.                                           │
│                                                                     │
│    [ Reconnect ]   < Choose a different document source >           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

`[ Reconnect ]` opens OAuth popup; success → file list reloads
automatically without losing the in-progress envelope (per Q7).

### Drive API rate-limited (our 30/60s limiter or Google's)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Slow down — too many requests in a short time.                     │
│  Try again in a few seconds.                                        │
│  [ Retry ]                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Drive API down / 5xx

```
┌─────────────────────────────────────────────────────────────────────┐
│  Couldn't reach Google Drive right now.                             │
│  This is usually temporary.                                         │
│  [ Try again ]   < Choose a different document source >             │
└─────────────────────────────────────────────────────────────────────┘
```

### OAuth declined (user cancelled re-consent in popup)

Modal stays in the "Token expired" state with a small inline note:
"Connection cancelled. Try again or use a different source."

---

## Loading state

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⌂ My Drive  /                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ▱▱▱▱▱▱▱▱  loading skeleton — 6 row placeholders ▱▱▱▱▱▱▱▱            │
│  ▱▱▱▱▱▱▱▱                                                            │
│  ▱▱▱▱▱▱▱▱                                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Skeleton renders for ≤ 1.5 s. Beyond that, show the spinner only —
folder content load taking longer than 1.5s indicates a real problem
(rate limit, network).

---

## Pagination

Drive returns 100 results per page. After 100, show:

```
│  ────────────────────────────────────────────────────────  │
│  [ Load more (100 of 247) ]                                │
```

No infinite scroll — explicit Load More keeps the file count visible.

---

## Notes for Phase 3

- Modal chrome: re-use the existing modal scrim + `<Modal>` component
  (used for delete-confirm and account-actions). Don't roll a new
  one.
- File row: 56 px tall, icon left (24 px), name + meta middle (flex 1),
  selection check right (24 px).
- Search input: debounced 200 ms (per Q9 defensive UX).
- Account switcher dropdown: only renders when accounts.length > 1.
  v1 = single account = no dropdown.
