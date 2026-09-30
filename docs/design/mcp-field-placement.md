# MCP field placement

Contract for inspecting a draft envelope's PDF and placing signature fields on it. Steps 8e (inspect) and 9 (place, validate, update) implement this document. Step 9b (preview) is specified here so that pull request does not invent a second contract. The seal is unchanged: displayed-page conversion stays behind one function until Insert C (#372) exports the shared helper.

The engine is stateless. It resolves and validates a field set against one document, bound to one envelope and that envelope's signers. It does not keep a session, a field index, or a PDF cache. Placement is persisted by the envelopes service.

`FieldPlacementModule` is not imported by `AppModule`. Nothing in this contract mounts a route or reads `mcpServer` (that flag belongs to step 1).

## Units

`units` is the string `pdf_points_top_left_displayed`.

Every box the engine accepts or returns, except `normalized` and the PDF-user-space `mediabox` / `cropbox` / `pdf_box`, is in PDF points from the top-left of the page **as displayed**: CropBox, with `/Rotate` applied, y down. That is pdf.js `getViewport({ scale: 1 })`.

`normalized` is what `envelope_fields` stores: page from 1, and `x`, `y`, `width`, `height` as 0–1 fractions of that displayed page (top-left), rounded to 4 decimals by `normalizeRect`.

## Kinds and sizes

Input kinds: `signature`, `initials`, `date`, `text`, `checkbox`, `email`, `name`.

`name` is stored as `kind: text` and `link_id: 'name'`. Reading a row back, `text` plus `link_id === 'name'` is reported as `name`.

Default sizes are points, not page fractions. Minimums are the `field_too_small` thresholds. A size equal to the minimum passes; a size more than 0.01pt under it fails.

| Kind      | Default (pt) | Minimum (pt) |
| --------- | ------------ | ------------ |
| signature | 180 × 50     | 60 × 20      |
| initials  | 72 × 40      | 24 × 16      |
| date      | 110 × 24     | 40 × 14      |
| text      | 180 × 24     | 40 × 14      |
| email     | 200 × 24     | 60 × 14      |
| name      | 180 × 24     | 40 × 14      |
| checkbox  | 16 × 16      | 8 × 8        |

`required` defaults to true. `label` and `client_ref` are echoed on the result and are not columns.

## Inspect

`inspectDocument({ envelope_id, pages?, text_granularity?, cursor? })`

Returns:

- `page_count` — every page in the file, even when `pages` filters the payload.
- `units` — the string above.
- `pages` — `{ page, view_width, view_height, rotation, mediabox, cropbox }`. `mediabox` and `cropbox` are PDF user space (`x`, `y`, `width`, `height`, origin bottom-left).
- `text` — items `{ page, text, box }` grouped into lines when `text_granularity` is `line` (the default) or left as words when it is `word`.
- `text_granularity` — the granularity actually used.
- `next_cursor` — present when more than 2000 text items were available after the page filter. The cursor is the base64url encoding of the next index. A cursor past the end yields an empty `text` and `next_cursor: null`.
- `form_fields` — see AcroForm. Not capped.

`pages` lists at most 50 page numbers. More than 50 is `inspect_pages_limit`. A page outside `1..page_count` is `inspect_page_out_of_range`. Those two are request errors, not placement slugs.

Anchor search uses the full line index, not the capped `text` page.

## Place

`placeFields({ envelope_id, fields, mode?, dry_run? })`

Each field has `signer_id`, optional `kind`, `required` (default true), optional `label`, optional `client_ref`, and **exactly one** locator:

- `box`: `{ page, x, y, width?, height? }`
- `anchor`: see below
- `form_field`: `{ name, page? }`

`kind` is required for `box` and `anchor`. For `form_field` it defaults to that widget's `suggested_kind`.

`mode` is `replace` (default) or `append`. `dry_run` resolves and validates and does not write.

The result lists every field in the set that resolved:

- `id` — database id after a write, otherwise null. `append` goes through `replaceFields`, which deletes and reinserts, so ids of fields that were already stored change. Callers keep ids from the latest response. `updateFields` does not churn ids.
- `client_ref`, `label` — echoed; null when the field was already stored.
- `signer_id`, `kind`, `required`, `page`
- `box` — displayed points
- `normalized` — stored fractions, including `page`
- `source` — `box`, `anchor:<text>#<n>`, or `form_field:<name>`
- `nearest_text` — `{ text, distance_pt, side }` where `side` is where the text sits relative to the field (`left`, `right`, `above`, `below`, `over`)

Plus `report` and `persisted`.

`persisted` is true only when `dry_run` is not set and `report.errors` is empty. Warnings still persist. The write is `EnvelopesService.replaceFields`. Drafts only; any other status is `envelope_not_draft`. A missing original file is `file_not_ready`.

## Anchor

```
{
  text,
  occurrence?: 1,
  page?: number,
  match?: "exact" | "case_insensitive",
  position?: "right" | "left" | "above" | "below" | "over",
  gap?: 6,
  dx?: number,
  dy?: number,
  width?: number,
  height?: number
}
```

`exact` is a case-sensitive substring. `case_insensitive` lowercases both sides. Matches are ordered by page, then displayed y, then displayed x. A line that contains the substring more than once yields one match per non-overlapping hit.

`occurrence` is 1-based into that list. `0` matches is `anchor_not_found`. An occurrence below 1 or above the match count is `anchor_occurrence_out_of_range`. Both include `match_count`.

`right` (the default) follows the text run's advance, not the page's +x. On horizontal left-to-right text that is `box.x = anchor.x + anchor.width + gap`, and the field's bottom edge is the anchor's baseline plus 3pt. The same rule on rotated text uses the run: the field sits `gap` past the end of the advance, overlaps the baseline by 3pt, and extends along the glyph up-vector. `left` is the opposite direction along the advance and uses that same 3pt baseline nudge. `above` and `below` follow the glyph up-vector. `over` centers on the matched run and ignores `gap`. `dx` and `dy` are applied after that (`dy` positive is down).

A match stays inside one line. Text split across a line break is not one anchor. The default match is case-sensitive.

## AcroForm

Inspect returns `form_fields`: `{ page, name, type, box, suggested_kind }`.

`type` is `Signature`, `Text`, `CheckBox`, `RadioButton`, `PushButton`, `ComboBox`, or `ListBox`. Checkbox, radio, and push button are distinguished inside PDF `Btn`. Combo box and list box are distinguished inside `Ch`.

`suggested_kind` uses the widget name first (lowercased): prefix `sig` → signature, `init` → initials, `date` → date, `email` → email, `name` → name, substring `checkbox` → checkbox. Otherwise `Signature` → signature, `CheckBox` → checkbox, and every other type → text.

`form_field: { name, page? }` uses the widget of that name. With `page`, only that page. Exactly one widget must match. Zero widgets is `form_field_not_found`. More than one is `form_field_ambiguous` (both include `match_count`). The field's displayed box is the widget's box. Omitted `kind` becomes `suggested_kind`.

## Update

`updateFields({ envelope_id, updates, remove? })`

`updates` is `{ field_id, dx?, dy?, box?, width?, height?, kind?, signer_id?, required? }`. `dx` and `dy` shift the displayed box. `box` replaces it (`page` optional). `width` and `height` are points. An id listed in both `remove` and `updates` is removed.

The whole set is re-validated at the `place` stage. When the report has no errors, one repository transaction applies the patches and the deletes (`updateFieldsById`). Field ids stay. Drafts only. An unknown `field_id` is `field_not_found` and nothing is written.

## Validation

One validator (`validateFieldPlacement` in `packages/shared`) so the SPA can later run the same rules before `replaceFields`. Locator resolution stays in the API because it needs the PDF. Locator failures use the same issue helper, so the messages match.

An issue is `{ slug, message, retryable: false, next_steps: [{ tool, hint }] }` plus structured fields (`field_id`, `client_ref`, `signer_id`, `page`, `overflow_pt`, `match_count`, `other_field_id`, `nearest_text`). `message` and `next_steps` never contain document text. Document text is only placed in structured fields such as `nearest_text` and `source`.

`invalid_field_locator` is returned on that field and is never thrown. The rest of the call still resolves.

| Slug                             | When                                                                                                                                      | Severity                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `field_page_out_of_range`        | `page` is not an integer in `1..page_count`                                                                                               | error                                       |
| `field_out_of_bounds`            | box is outside the displayed page by more than 0.01pt. The message states the overflow in points.                                         | error                                       |
| `field_too_small`                | width or height is more than 0.01pt under the kind minimum                                                                                | error                                       |
| `fields_overlap`                 | same page, intersection area greater than 0.5pt². The message names both ids.                                                             | error                                       |
| `field_covers_text`              | the field covers more than 25% of a text **line** box                                                                                     | warning                                     |
| `signer_without_signature_field` | a signer has no required `signature` or `initials` field (same rule as send; `name` does not count; an optional signature does not count) | warning at place, error at preview and send |
| `signer_not_in_envelope`         | `signer_id` is not on the envelope                                                                                                        | error                                       |
| `invalid_field_locator`          | unknown kind, or not exactly one locator                                                                                                  | error                                       |
| `anchor_not_found`               | no matches. Includes `match_count`.                                                                                                       | error                                       |
| `anchor_occurrence_out_of_range` | occurrence outside the matches. Includes `match_count`.                                                                                   | error                                       |
| `form_field_not_found`           | no widget with that name. Includes `match_count`.                                                                                         | error                                       |
| `form_field_ambiguous`           | more than one widget matches the name (and page, when set). Includes `match_count`.                                                       | error                                       |

`report.ready` is `errors.length === 0`. `report.envelope_errors` is the subset whose slug is `signer_without_signature_field` or `signer_not_in_envelope`.

Tool hints: `envelopes_inspect_document`, `envelopes_place_fields`, `envelopes_update_fields`.

## Geometry

`apps/api/src/field-placement/displayed-page.ts` is the only place that converts displayed points to PDF user space and back. Replace `displayedPointToPdf` and `pdfPointToDisplayed` with the Insert C helper. Do not change `burn-in-fields.ts` or the sealer in this work.

Round-trip tolerance against a stamped PDF path is 0.5pt.

## User unit

pdf.js multiplies the displayed page by the page's UserUnit. A UserUnit of 2 on a 612×792 MediaBox is a 1224×1584 displayed page, and every displayed point (including default sizes and `field_too_small`) is in that scaled space. pdf-lib's MediaBox and CropBox stay in raw PDF user space and are not multiplied. Stored fractions are of the displayed page, and the viewport inverse includes the UserUnit, so a placed box round-trips. Callers that want paper points must divide by the UserUnit themselves. This engine does not.

## Limits

`inspectPdfBytes` is the only pdf-lib parse. It checks the 25 MB cap and the `%PDF-` magic, reads each page's MediaBox, CropBox, and rotation, and rejects more than 100 pages with `file_too_many_pages`. An encrypted or corrupt file is `file_unreadable`, not a raw parser error. Field placement calls that helper before pdf.js.

pdf.js runs in one worker. Each call destroys the loading task in a `finally`. A call that exceeds 20 seconds terminates the worker and the next call starts a new one (`inspect_timeout`). The worker has a memory cap. There is no document cache. The worker keeps the pdf.js module, not PDF bytes.

`signer_without_signature_field` uses `signerIdsWithRequiredSignature` in `packages/shared`, the same helper `EnvelopesService.send` uses.

## Preview (step 9b)

Not part of the inspect/place pull request. Preview renders with `@napi-rs/canvas` (pdf.js 6 vector paths are blank on node-canvas). It does not add a `pnpm rebuild canvas` image step. pdf.js is pointed at its bundled `standard_fonts`, and labels use a font from that folder, because the slim image has no system fonts. Pixel count and scale are clamped so one page cannot allocate gigabytes. Signer colour is `envelope_signers.color`. There is no placement colour palette.

Preview renders one PNG per page. Fields are filled and stroked in that signer colour. The label is `<short id> <kind> (<signer name>)`. Fields that have an error are red and dashed. `pages` defaults to the pages that contain fields, at most 5. `dpi` is 72–150, default 96. The PNG is drawn with the same displayed-page mapping the seal will use, and a pixel test checks that the drawn box equals that geometry. The PR CI builds the API image for arm64.

The preview report repeats `box`, `pdf_box`, `normalized`, `nearest_text`, `errors`, `warnings`, `envelope_errors`, and `ready`.
