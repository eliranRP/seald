# Surface 4 — Drive picker integration in Use Template flow

Route: `/templates/:id/use`
Existing screen: Template "Use" wizard, step 1 is "Document".
Currently: shows the template's pre-loaded PDF + an "Upload your own"
button (replaces the template body, keeps fields).

Adds a third option: "Pick from Google Drive".

## Before (current state, step 1 of the Use Template wizard)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Use template: Acme NDA v3                                          │
│  ────────────────────────────────────────────────────────────────   │
│                                                                     │
│  Step 1 of 3 — Document                                             │
│                                                                     │
│  ┌──────────────────────────────┐                                   │
│  │  📄 Acme NDA v3.pdf          │   This template has signers and   │
│  │  3 pages · template default  │   fields preset. You can replace  │
│  └──────────────────────────────┘   the document body and the       │
│                                     fields will stay in place.     │
│  [ Replace with my own PDF ]                                        │
│                                                                     │
│  [ Cancel ]                                          [ Continue → ]│
└─────────────────────────────────────────────────────────────────────┘
```

## After (Phase 5 implementation)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Use template: Acme NDA v3                                          │
│  ────────────────────────────────────────────────────────────────   │
│                                                                     │
│  Step 1 of 3 — Document                                             │
│                                                                     │
│  ┌──────────────────────────────┐                                   │
│  │  📄 Acme NDA v3.pdf          │   This template has signers and   │
│  │  3 pages · template default  │   fields preset. Replacing the    │
│  └──────────────────────────────┘   document keeps the field        │
│                                     layout in place.                │
│                                                                     │
│  Replace with:                                                      │
│  [ ⬆ Upload a PDF ]   [ ◐ Pick from Google Drive ]                  │
│                          ↑ disabled if no Drive account connected   │
│                                                                     │
│  [ Cancel ]                                          [ Continue → ]│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Page-count mismatch warning (per Q4 default)

If the picked file's page count ≠ the template's:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠ The new document has 5 pages; this template was built for 3.    │
│    Fields on missing pages are pinned to the last page.            │
│    Review the field layout in step 3 before sending.               │
│                                                                     │
│    [ Continue with this file ]   [ Pick a different file ]         │
└─────────────────────────────────────────────────────────────────────┘
```

This already exists for the Upload-PDF path (today). Reusing the
same banner — no new component.

---

## "Save as template" remains a separate flow (per Q4)

After the user sends the envelope built from a Drive file, the
existing "Save as template" CTA in the post-send confirmation screen
is the path to add it to the template library. The picker itself does
NOT create templates from Drive files — keeps the template library
curated.

---

## Notes for Phase 3

- The two "Replace with" buttons share a row; design should be
  identical to the existing destructive/secondary button pair styling
  used elsewhere in the wizard.
- When the user has not connected Drive yet, the
  `[ Pick from Google Drive ]` button shows a `<Tooltip>` on hover:
  "Connect Google Drive in Settings to use this." — does NOT
  auto-trigger the OAuth popup (mid-wizard popup would lose draft
  state).
