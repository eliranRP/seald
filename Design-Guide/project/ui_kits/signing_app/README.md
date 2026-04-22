# Sealed — Signing App UI Kit

The core product surface: upload a PDF → place signature fields → sign → send.

## Screens

1. **Upload** — landing with big drop zone + three path cards (self-sign / request / template).
2. **Place fields** — document canvas with field palette and signers. **2 layout variations:**
   - `split` — right-rail tools + signer list (default). Strong for drafting with context visible.
   - `left` — compact left tool-rail, center canvas. Strong when the document itself needs all the horizontal room.
3. **Sign** — tabbed pad (type / draw / upload) with the Caveat script moment.
4. **Sent** — confirmation with the serif "Sealed." moment and the document preview.

Switch layouts with the pill toggle in the bottom-right of the Place Fields screen. Step between screens with the bottom-left stepper. Step persists in `localStorage`.

## Components (`Screens.jsx`)

- `TopNav`, `LeftRail` — app chrome
- `UploadScreen`, `PlaceFieldsScreen`, `SignScreen`, `SentScreen`
- Reuses `Button`, `Badge`, `Card`, `TextField`, `Avatar`, `SignatureMark`, `DocThumb`, `Icon` from `ui_kits/_shared/components.jsx`.
