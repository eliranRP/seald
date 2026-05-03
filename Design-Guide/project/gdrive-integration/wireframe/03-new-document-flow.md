# Surface 3 — Drive picker integration in New Document flow

Route: `/document/new`
Existing screen: `<UploadRoute>` — currently shows "Upload PDF" + a
template list. Adds a third card: "From Google Drive".

## Before (current state, for reference)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Start a new document                                               │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ┌───────────────────────┐    ┌─────────────────────────────────┐   │
│  │   ⬆ Upload a PDF      │    │  📋 From a template             │   │
│  │   Drag a file or       │    │  Reuse a saved template with    │   │
│  │   click to browse      │    │  signers and fields preset      │   │
│  └───────────────────────┘    └─────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## After (Phase 5 implementation)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Start a new document                                               │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ┌───────────────────────┐    ┌─────────────────────────────────┐   │
│  │   ⬆ Upload a PDF      │    │  📋 From a template             │   │
│  │   Drag a file or      │    │  Reuse a saved template with    │   │
│  │   click to browse     │    │  signers and fields preset      │   │
│  └───────────────────────┘    └─────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  ◐ From Google Drive                                          │  │
│  │  Pick a PDF, Google Doc, or Word document from your Drive.    │  │
│  │                                                               │  │
│  │  [ Pick from Google Drive ]                                   │  │
│  │                                                               │  │
│  │  (or) < Connect Google Drive in Settings >                    │  │
│  │       ↑ link only when no account connected                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Primary CTA on the card:** `[ Pick from Google Drive ]` — only
enabled when ≥ 1 Drive account connected. Opens the Drive picker
modal (surface 2).

If no account connected: card shows `< Connect Google Drive in
Settings >` link instead (deep link to `/settings/integrations`).

---

## Flow after picking a file

```
[ User clicks Pick from Google Drive ]
        ↓
[ Drive picker modal opens (surface 2) ]
        ↓
[ User picks Acme MSA - signed.pdf ]
        ↓
[ Picker closes, conversion progress shown if needed (surface 5) ]
        ↓
[ Same flow as Upload PDF: routes into the field-placement step ]
        ↓
[ /document/<draft-id>/place ]
```

The downstream signing flow is unchanged. The Drive picker is a new
**source** for the document blob; everything after is the existing
pipeline. This keeps the PR scope tight (WT-E only wires the picker
into the source-selection screen).

---

## Notes for Phase 3

- The 3rd card sits below the Upload + Template grid (full-width row).
  At 1920+ widths, all 3 cards CAN fit on one row — design must handle
  both layouts (`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`).
- When `feature.gdriveIntegration === false`, the card is hidden
  entirely — fail closed. (Same flag pattern as multi-account.)
- The "Connect Google Drive in Settings" link uses the existing
  text-link style; opens `/settings/integrations` in same tab (no
  popup — user is mid-flow but explicit nav is OK).
