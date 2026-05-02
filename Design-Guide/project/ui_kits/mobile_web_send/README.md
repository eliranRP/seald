# Sealed — Mobile Web · Send Flow UI Kit

The **sender** flow as it runs on a phone browser (mobile Safari / Chrome on
iOS / Android). Distinct from `mobile_app/`, which is the iOS-style signer
inbox. This kit is HTML/CSS/web-only — no native chrome, no iOS pills.

## What this designs

A mobile-web user opens `seald.nromomentum.com` on their phone, signs in, and
needs to **add a PDF and send it for signature**. Today the SPA's send path
(`/document/new` → `UploadRoute` → editor) is desktop-first: the editor's
right-rail tools, drag-to-place fields, and full-canvas PDF rendering all
assume ≥ 1024 px. On mobile-web you currently get a horizontal-scroll
canvas, an unusable field tray, and the bottom-fixed CTA fights iOS Safari's
URL bar.

This kit re-thinks every step for one-thumb operation.

## Six screens

1. **Start** (`/document/new`) — three tall source tiles: **Upload PDF**,
   **Take photo**, **From a template**, with a "Recent" row underneath.
2. **File ready** — single-page PDF thumb, file name, page count, "Replace"
   ghost button. Sticky bottom: **Continue**.
3. **Add signers** — vertical stack of signer rows; "Add me as signer"
   toggle on top; "+ Add signer" opens a bottom sheet for name + email
   + role. Sticky bottom: **Next: place fields**.
4. **Place fields** — full-bleed page viewer over a **12-page PDF**, with
   a tappable thumbnail filmstrip across the top (active page is bordered
   indigo; pages that already have a field show a green dot). Field tray
   sits at the bottom with chips: Signature / Initial / Date / Text /
   Checkbox.

   *Interaction model* (mirrors desktop `signing_app/Screens.jsx`):
   - **Tap a chip** to arm it → header swaps to "Tap to drop · {label}".
     Tap the canvas to drop; the new field is auto-selected.
   - **Drop with 2+ signers configured** → the *Assigned signers* sheet
     opens immediately so the user picks one or both (web parity). The
     field defaults to the first signer until the picker is confirmed;
     when more than one is chosen, the field renders as a split pill.
   - **Tap a placed field** to select (one click). A small drag handle
     dot appears at the top-left and a dark action toolbar floats above
     with three buttons: **Pages**, **Signers**, **Delete**.
   - **Drag a selected field** anywhere on the page — pointer events
     drive the move (works for touch + mouse), live preview during
     drag, position commits on release, clamped to the canvas. When
     several fields are selected they translate together.
   - **Tap another field** while one is already selected → adds it to
     the selection (additive multi-select). Tap an already-selected
     member to remove it. The bounding box and a violet group toolbar
     replace the single-field toolbar; counts update live.
   - **Group** in the multi-select toolbar makes the selection sticky —
     fields share a `groupId`, a small `group` chip renders on each
     member, and a single tap on any member auto-selects the whole
     group thereafter. **Ungroup** clears the `groupId`.
   - **Pages →** opens the *Place on pages* bottom sheet. Same 5 modes
     as the desktop editor: **Only this page · All pages · All pages but
     last · Last page · Custom** (custom takes a comma list, e.g.
     `1, 3, 5`). A duplicated field renders a small `🔗 Np` linked
     badge so the user can see at a glance which fields are
     multi-page.
   - **Signers →** opens the *Assigned signers* bottom sheet with a
     multi-select chip per signer. When ≥2 signers are assigned, the
     placed field renders as a **split pill** (one cell per signer
     color) — same convention as the desktop editor.
   - **Delete** removes the field everywhere it's linked.
   - **Filmstrip thumbnail tap** (or swipe ←/→) jumps between pages.
5. **Review & send** — title editable inline, signers list, fields-per-
   signer count, optional message textarea, expiry stub. Sticky bottom:
   **Send for signature**.
6. **Sent** — serif "Sealed." moment, the doc thumb, two buttons:
   **View status** (→ `/document/:id`) and **Send another** (→ Start).

## Frame

`mobile-web-frame.jsx` renders a phone-shaped chrome with:
- Top: mobile-Safari URL pill (`seald.nromomentum.com/document/new`),
  reload icon, share icon — pure visual scaffolding.
- Content: scrollable `100dvh` minus URL bar minus bottom-bar.
- Bottom: home-indicator strip (so the design reads as iOS Safari);
  Android variants can substitute later.
- Sticky-bottom CTA pattern accounts for `env(safe-area-inset-bottom)`.

## Components

Reuses from `_shared/components.jsx`:
`Button`, `Icon` (lucide), `Badge`, `TextField`, `Avatar`, `DocThumb`,
`SignatureMark`. Frame helpers in `mobile-web-frame.jsx`:
- `MWStep` — top stepper (Step N of 6 + back chevron)
- `MWStickyBar` — sticky bottom CTA wrapper
- `MWBottomSheet` — modal sheet rising from the bottom

Place-step internals in `MobileWebSend.jsx`:
- `PageFilmstrip` — horizontally scrolling page thumbs (tap to jump,
  green dot when a page has any linked field)
- `PlacedFieldMobile` — single-signer pill **or** multi-signer split
  pill; shows a `🔗 Np` badge when `linkedPages.length > 1`
- `FieldActionToolbar` — dark pill above the selected field
  (`Pages | Signers | Delete`)
- `MWApplyPagesSheet` — the 5-mode bulk-apply sheet (parity with
  desktop `PlaceOnPagesPopover`)
- `MWAssignSignersSheet` — multi-select signer chips

## Field model

```ts
type PlacedField = {
  id: string;
  type: 'sig' | 'ini' | 'dat' | 'txt' | 'chk';
  page: number;            // origin page (where it was first dropped)
  x: number; y: number;    // canvas-relative pixels
  signerIds: string[];     // ≥2 → split-pill render
  linkedPages: number[];   // [] / single → page-local; multi → duplicated
  groupId?: string;        // sticky multi-select; tapping any member
                           // selects the whole group
};
```

This matches the desktop's `duplicateField(fid, mode, customPages)` in
`signing_app/Screens.jsx:602`, so SPA wiring is one-to-one. The `groupId`
field is additive — desktop can adopt the same convention without
schema impact (it's optional).

## How to preview

Open `Design-Guide/project/ui_kits/mobile_web_send/index.html` in any
modern browser. Three sections, top to bottom:

1. **Interactive phone** — tap CTAs to walk start → … → sent. On the
   place step, tap a chip to arm a tool, tap the page to drop, tap a
   placed field to surface the action toolbar, then try **Pages** /
   **Signers**.
2. **Six-step hub** — all canonical steps frozen side-by-side.
3. **Place-fields interactions hub** — the same place step rendered in
   six interaction states (empty · armed · selected · apply-to-pages
   sheet · assign-signers sheet · linked + multi-signer) so the
   implementation path is unambiguous.

## Out of scope (intentionally deferred)

- Actual PDF rendering performance (we'll wire to existing `usePdfDocument`).
- Field-resize gestures (mobile uses fixed sizes; desktop keeps drag-resize).
- Camera-scan implementation (button is wired to `<input capture>` later).
- Multi-document flows (one PDF per session at MVP).
