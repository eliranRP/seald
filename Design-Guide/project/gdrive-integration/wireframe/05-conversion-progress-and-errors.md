# Surface 5 — Conversion progress + named error states

Triggered after the Drive picker (surface 2) returns a chosen file.
- PDF picked → no conversion needed; proceed straight to the
  field-placement step.
- Google Doc picked → server calls Drive `files.export(application/pdf)`
- `.docx` picked → server uploads to Gotenberg, gets PDF back

Conversion happens server-side after the picker closes; client polls
status and shows the progress dialog.

---

## Conversion in progress (polling)

```
┌──────────────────────────────────────────────────────────────────┐
│  Preparing your document...                                      │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│            ⏳  Converting "Vendor agreement.docx" to PDF.        │
│                                                                  │
│            ▓▓▓▓▓▓▓▓▓▓▱▱▱▱▱▱▱▱▱▱▱▱   45%                          │
│                                                                  │
│            This usually takes a few seconds.                     │
│                                                                  │
│                                  [ Cancel ]                      │
└──────────────────────────────────────────────────────────────────┘
```

Cancel = aborts the conversion job (server-side), closes dialog,
returns user to the source-selection screen with the picker available
again.

---

## Conversion success (auto-advance)

No dialog — once the converted PDF is ready, the wizard auto-advances
to the field-placement step. A toast confirms:

```
┌────────────────────────────────────────────────────┐
│  ✓ Vendor agreement.docx converted to PDF          │
└────────────────────────────────────────────────────┘
```

Toast auto-dismisses after 4 s.

---

## Named error states (per Phase 1 manager checklist)

### 1. token-expired

(Surface 2 already handles this — surfaced inside the picker before
the conversion is requested.)

### 2. no-files-match-filter

(Surface 2 — empty results state.)

### 3. conversion-failed

```
┌──────────────────────────────────────────────────────────────────┐
│  Couldn't convert this document                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  ⚠ Vendor agreement.docx couldn't be converted to PDF.           │
│                                                                  │
│  This usually means the file uses an unsupported feature         │
│  (macros, embedded objects, or password protection).             │
│                                                                  │
│  Try one of:                                                     │
│  ▸ Open the file in Word or Google Docs and "Download as PDF"   │
│    yourself, then upload that PDF instead.                       │
│  ▸ Pick a different file from Drive.                             │
│                                                                  │
│         [ Pick a different file ]   [ Upload a PDF ]             │
└──────────────────────────────────────────────────────────────────┘
```

### 4. oauth-declined

(Surface 1 + 2 — user cancelled the OAuth consent. Banner remains
inside the picker / Settings page; no new dialog.)

### 5. (bonus) file-too-large

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ This file is larger than 25 MB.                               │
│  Seald accepts documents up to 25 MB.                            │
│  [ Pick a smaller file ]                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 6. (bonus) unsupported-mime

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ This file type isn't supported.                               │
│  Pick a PDF, Google Doc, or Word document.                       │
│  [ Pick a different file ]                                       │
└──────────────────────────────────────────────────────────────────┘
```

(Should never trigger because surface 2's filter excludes these — but
defensive handling for files added between page load and pick.)

---

## Notes for Phase 3

- Progress dialog: re-use the existing `<Modal>` component + a
  `<ProgressBar>` (used in the upload-PDF path already).
- The toast: re-use the existing `<Toast>` system from the document
  send flow.
- The 6 error states each map to a single `errorCode` string returned
  by the API. Document the mapping in the API DTO (Phase 5 / WT-D PR
  body).
